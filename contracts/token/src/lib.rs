#![no_std]
//! HarvestLink mock USDC — a minimal SEP-41-style fungible token for the Stellar
//! testnet MVP. It exposes the subset of the token interface the protocol needs
//! (`transfer`, `balance`, `mint`, `burn`) plus a rate-limited `faucet` so pilot
//! users and liquidity providers can obtain test USDC without an admin in the loop.
//!
//! On mainnet this contract is replaced by a real, anchor-issued USDC — no faucet,
//! no self-mint. It exists purely to make the testnet demo self-contained.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, Address,
    Env, String,
};

#[contractevent]
#[derive(Clone)]
pub struct Mint {
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct Faucet {
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct Transfer {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct Burn {
    #[topic]
    pub from: Address,
    pub amount: i128,
}

const DAY_IN_LEDGERS: u32 = 17_280;
const INSTANCE_TTL_THRESHOLD: u32 = DAY_IN_LEDGERS * 30;
const INSTANCE_TTL_BUMP: u32 = DAY_IN_LEDGERS * 45;
const BALANCE_TTL_THRESHOLD: u32 = DAY_IN_LEDGERS * 30;
const BALANCE_TTL_BUMP: u32 = DAY_IN_LEDGERS * 45;

/// Max a single faucet call can mint: 100,000 test-USDC (7 decimals).
const FAUCET_MAX_PER_CALL: i128 = 100_000_0000000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TokenError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    InsufficientBalance = 3,
    InvalidAmount = 4,
    Unauthorized = 5,
    FaucetLimitExceeded = 6,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Decimals,
    Name,
    Symbol,
    Balance(Address),
}

#[contract]
pub struct TokenContract;

#[contractimpl]
impl TokenContract {
    /// Initialize the token metadata and admin. Callable exactly once.
    pub fn initialize(env: Env, admin: Address, decimals: u32, name: String, symbol: String) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, TokenError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Decimals, &decimals);
        env.storage().instance().set(&DataKey::Name, &name);
        env.storage().instance().set(&DataKey::Symbol, &symbol);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_BUMP);
    }

    /// Admin-only mint (used at setup to seed the demo pool).
    pub fn mint(env: Env, to: Address, amount: i128) {
        check_amount(&env, amount);
        let admin = Self::admin(&env);
        admin.require_auth();
        Self::bump_instance(&env);
        Self::receive(&env, &to, amount);
        Mint { to, amount }.publish(&env);
    }

    /// Rate-limited public faucet so any testnet user can grab demo USDC.
    /// Not present in the mainnet token.
    pub fn faucet(env: Env, to: Address, amount: i128) {
        to.require_auth();
        check_amount(&env, amount);
        if amount > FAUCET_MAX_PER_CALL {
            panic_with_error!(&env, TokenError::FaucetLimitExceeded);
        }
        Self::bump_instance(&env);
        Self::receive(&env, &to, amount);
        Faucet { to, amount }.publish(&env);
    }

    /// Move `amount` from `from` to `to`. Requires `from`'s authorization.
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        check_amount(&env, amount);
        Self::bump_instance(&env);
        Self::spend(&env, &from, amount);
        Self::receive(&env, &to, amount);
        Transfer { from, to, amount }.publish(&env);
    }

    /// Burn `amount` from `from`'s balance. Requires `from`'s authorization.
    pub fn burn(env: Env, from: Address, amount: i128) {
        from.require_auth();
        check_amount(&env, amount);
        Self::bump_instance(&env);
        Self::spend(&env, &from, amount);
        Burn { from, amount }.publish(&env);
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        let key = DataKey::Balance(id);
        if let Some(b) = env.storage().persistent().get::<DataKey, i128>(&key) {
            env.storage()
                .persistent()
                .extend_ttl(&key, BALANCE_TTL_THRESHOLD, BALANCE_TTL_BUMP);
            b
        } else {
            0
        }
    }

    pub fn decimals(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Decimals).unwrap_or(7)
    }

    pub fn name(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Name)
            .unwrap_or_else(|| String::from_str(&env, ""))
    }

    pub fn symbol(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Symbol)
            .unwrap_or_else(|| String::from_str(&env, ""))
    }
}

// Internal helpers kept out of the exported contract interface.
impl TokenContract {
    fn admin(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, TokenError::NotInitialized))
    }

    fn read_balance(env: &Env, addr: &Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(addr.clone()))
            .unwrap_or(0)
    }

    fn write_balance(env: &Env, addr: &Address, amount: i128) {
        let key = DataKey::Balance(addr.clone());
        env.storage().persistent().set(&key, &amount);
        env.storage()
            .persistent()
            .extend_ttl(&key, BALANCE_TTL_THRESHOLD, BALANCE_TTL_BUMP);
    }

    fn receive(env: &Env, to: &Address, amount: i128) {
        let balance = Self::read_balance(env, to);
        Self::write_balance(env, to, balance + amount);
    }

    fn spend(env: &Env, from: &Address, amount: i128) {
        let balance = Self::read_balance(env, from);
        if balance < amount {
            panic_with_error!(env, TokenError::InsufficientBalance);
        }
        Self::write_balance(env, from, balance - amount);
    }

    fn bump_instance(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_BUMP);
    }
}

fn check_amount(env: &Env, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, TokenError::InvalidAmount);
    }
}

#[cfg(test)]
mod test;
