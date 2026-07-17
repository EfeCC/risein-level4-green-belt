#![no_std]
//! HarvestLink warehouse receipt token.
//!
//! A receipt represents graded crop physically stored at a partner warehouse.
//! Units are kilograms with 7 fixed-point decimals (1_0000000 == 1.000 kg), and
//! balances are fungible **per crop symbol**, so a receipt is fractional and
//! partially redeemable — a farmer can reclaim part of a deposit while borrowing
//! against the rest.
//!
//! Issuance is **attestation-gated**: minting requires the co-authorization of the
//! warehouse operator *and* an independent inspector (a multi-sig-lite trust model
//! that mitigates fake/duplicate receipts). A rate-limited `request_demo_receipt`
//! faucet exists for the testnet pilot only; on mainnet it is removed and every
//! receipt originates from a real, co-signed deposit attestation.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, Address,
    Env, Symbol,
};

#[contractevent]
#[derive(Clone)]
pub struct Attested {
    #[topic]
    pub farmer: Address,
    #[topic]
    pub crop: Symbol,
    pub quantity: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct DemoIssued {
    #[topic]
    pub to: Address,
    #[topic]
    pub crop: Symbol,
    pub quantity: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct Transfer {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    pub crop: Symbol,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct Redeemed {
    #[topic]
    pub owner: Address,
    #[topic]
    pub crop: Symbol,
    pub amount: i128,
}

const DAY_IN_LEDGERS: u32 = 17_280;
const PERSIST_TTL_THRESHOLD: u32 = DAY_IN_LEDGERS * 30;
const PERSIST_TTL_BUMP: u32 = DAY_IN_LEDGERS * 45;

/// Demo faucet grant: 1,000 kg per call.
const DEMO_AMOUNT: i128 = 1_000_0000000;
/// Lifetime cap on demo receipts per address: 5,000 kg.
const DEMO_CAP: i128 = 5_000_0000000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ReceiptError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    InsufficientBalance = 5,
    DepositNotFound = 6,
    DemoLimitExceeded = 7,
}

/// On-chain provenance record for an attested deposit (audit trail).
#[contracttype]
#[derive(Clone)]
pub struct Deposit {
    pub id: u64,
    pub farmer: Address,
    pub crop: Symbol,
    pub quantity: i128,
    pub unit_value: i128,
    pub warehouse: Address,
    pub inspector: Address,
    pub timestamp: u64,
    pub redeemed: i128,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Warehouse,
    Inspector,
    NextDepositId,
    Deposit(u64),
    Balance(Address, Symbol),
    Supply(Symbol),
    DemoMinted(Address),
}

#[contract]
pub struct ReceiptContract;

#[contractimpl]
impl ReceiptContract {
    pub fn initialize(env: Env, admin: Address, warehouse: Address, inspector: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, ReceiptError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Warehouse, &warehouse);
        env.storage().instance().set(&DataKey::Inspector, &inspector);
        env.storage().instance().set(&DataKey::NextDepositId, &0u64);
    }

    /// Mint a receipt to `farmer` for an attested deposit. Requires the co-signature
    /// of BOTH the warehouse operator and the independent inspector.
    pub fn attest_deposit(
        env: Env,
        warehouse: Address,
        inspector: Address,
        farmer: Address,
        crop: Symbol,
        quantity: i128,
        unit_value: i128,
    ) -> u64 {
        Self::require_warehouse(&env, &warehouse);
        Self::require_inspector(&env, &inspector);
        if quantity <= 0 {
            panic_with_error!(&env, ReceiptError::InvalidAmount);
        }

        Self::mint(&env, &farmer, &crop, quantity);

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextDepositId)
            .unwrap_or(0);
        let deposit = Deposit {
            id,
            farmer: farmer.clone(),
            crop: crop.clone(),
            quantity,
            unit_value,
            warehouse,
            inspector,
            timestamp: env.ledger().timestamp(),
            redeemed: 0,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Deposit(id), &deposit);
        env.storage()
            .instance()
            .set(&DataKey::NextDepositId, &(id + 1));
        Attested {
            farmer,
            crop,
            quantity,
        }
        .publish(&env);
        id
    }

    /// Testnet-only faucet: mint a demo receipt to the caller so pilot users can try
    /// the full borrow flow without a real warehouse deposit. Capped per address.
    pub fn request_demo_receipt(env: Env, caller: Address, crop: Symbol) {
        caller.require_auth();
        let minted: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::DemoMinted(caller.clone()))
            .unwrap_or(0);
        if minted + DEMO_AMOUNT > DEMO_CAP {
            panic_with_error!(&env, ReceiptError::DemoLimitExceeded);
        }
        env.storage().persistent().set(
            &DataKey::DemoMinted(caller.clone()),
            &(minted + DEMO_AMOUNT),
        );
        Self::mint(&env, &caller, &crop, DEMO_AMOUNT);
        DemoIssued {
            to: caller,
            crop,
            quantity: DEMO_AMOUNT,
        }
        .publish(&env);
    }

    /// Transfer receipt units. Used both by farmers and (for collateral custody) by
    /// the lending pool. Requires `from`'s authorization.
    pub fn transfer(env: Env, from: Address, to: Address, crop: Symbol, amount: i128) {
        from.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, ReceiptError::InvalidAmount);
        }
        Self::spend(&env, &from, &crop, amount);
        Self::receive(&env, &to, &crop, amount);
        Transfer {
            from,
            to,
            crop,
            amount,
        }
        .publish(&env);
    }

    /// Redeem (burn) receipts when the farmer physically collects the crop.
    /// Requires both the owner and the warehouse to authorize the release.
    pub fn redeem(env: Env, warehouse: Address, owner: Address, crop: Symbol, amount: i128) {
        Self::require_warehouse(&env, &warehouse);
        owner.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, ReceiptError::InvalidAmount);
        }
        Self::spend(&env, &owner, &crop, amount);
        let supply = Self::read_supply(&env, &crop);
        env.storage()
            .persistent()
            .set(&DataKey::Supply(crop.clone()), &(supply - amount));
        Redeemed {
            owner,
            crop,
            amount,
        }
        .publish(&env);
    }

    pub fn balance(env: Env, owner: Address, crop: Symbol) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(owner, crop))
            .unwrap_or(0)
    }

    pub fn total_supply(env: Env, crop: Symbol) -> i128 {
        Self::read_supply(&env, &crop)
    }

    pub fn get_deposit(env: Env, id: u64) -> Deposit {
        env.storage()
            .persistent()
            .get(&DataKey::Deposit(id))
            .unwrap_or_else(|| panic_with_error!(&env, ReceiptError::DepositNotFound))
    }

    pub fn next_deposit_id(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::NextDepositId)
            .unwrap_or(0)
    }

    pub fn get_warehouse(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Warehouse)
            .unwrap_or_else(|| panic_with_error!(&env, ReceiptError::NotInitialized))
    }

    pub fn get_inspector(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Inspector)
            .unwrap_or_else(|| panic_with_error!(&env, ReceiptError::NotInitialized))
    }

    /// Rotate warehouse/inspector authorities (admin only).
    pub fn set_authorities(env: Env, warehouse: Address, inspector: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, ReceiptError::NotInitialized));
        admin.require_auth();
        env.storage().instance().set(&DataKey::Warehouse, &warehouse);
        env.storage().instance().set(&DataKey::Inspector, &inspector);
    }
}

// Internal helpers kept out of the exported contract interface.
impl ReceiptContract {
    fn require_warehouse(env: &Env, warehouse: &Address) {
        let stored: Address = env
            .storage()
            .instance()
            .get(&DataKey::Warehouse)
            .unwrap_or_else(|| panic_with_error!(env, ReceiptError::NotInitialized));
        if stored != *warehouse {
            panic_with_error!(env, ReceiptError::Unauthorized);
        }
        warehouse.require_auth();
    }

    fn require_inspector(env: &Env, inspector: &Address) {
        let stored: Address = env
            .storage()
            .instance()
            .get(&DataKey::Inspector)
            .unwrap_or_else(|| panic_with_error!(env, ReceiptError::NotInitialized));
        if stored != *inspector {
            panic_with_error!(env, ReceiptError::Unauthorized);
        }
        inspector.require_auth();
    }

    fn read_balance(env: &Env, owner: &Address, crop: &Symbol) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(owner.clone(), crop.clone()))
            .unwrap_or(0)
    }

    fn write_balance(env: &Env, owner: &Address, crop: &Symbol, amount: i128) {
        let key = DataKey::Balance(owner.clone(), crop.clone());
        env.storage().persistent().set(&key, &amount);
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSIST_TTL_THRESHOLD, PERSIST_TTL_BUMP);
    }

    fn read_supply(env: &Env, crop: &Symbol) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Supply(crop.clone()))
            .unwrap_or(0)
    }

    fn mint(env: &Env, to: &Address, crop: &Symbol, amount: i128) {
        let bal = Self::read_balance(env, to, crop);
        Self::write_balance(env, to, crop, bal + amount);
        let supply = Self::read_supply(env, crop);
        env.storage()
            .persistent()
            .set(&DataKey::Supply(crop.clone()), &(supply + amount));
    }

    fn spend(env: &Env, from: &Address, crop: &Symbol, amount: i128) {
        let bal = Self::read_balance(env, from, crop);
        if bal < amount {
            panic_with_error!(env, ReceiptError::InsufficientBalance);
        }
        Self::write_balance(env, from, crop, bal - amount);
    }

    fn receive(env: &Env, to: &Address, crop: &Symbol, amount: i128) {
        let bal = Self::read_balance(env, to, crop);
        Self::write_balance(env, to, crop, bal + amount);
    }
}

#[cfg(test)]
mod test;
