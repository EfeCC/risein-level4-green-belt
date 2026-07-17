#![no_std]
//! HarvestLink lending pool — the protocol's core.
//!
//! Liquidity providers deposit USDC and receive pool **shares**. Farmers lock
//! warehouse **receipt** tokens as collateral and borrow USDC up to a
//! Loan-to-Value (LTV) fraction of the collateral's value, where value is derived
//! from the **oracle TWAP** (never spot price). Interest accrues linearly and is
//! realized to LPs on repayment, lifting the share price. If a loan's collateral
//! value falls below the liquidation threshold, anyone may liquidate it.
//!
//! LP accounting uses a vault model:
//!   total_assets = pool USDC cash + outstanding principal
//!   price_per_share = total_assets / total_shares
//! Accrued-but-unpaid interest is intentionally excluded from `total_assets`
//! (conservative) and only lifts the share price once actually paid in.
//!
//! All monetary amounts, receipt kilograms and prices use 7 fixed-point decimals.

use soroban_sdk::{
    contract, contracterror, contractclient, contractevent, contractimpl, contracttype,
    panic_with_error, Address, Env, Symbol,
};

// Lightweight cross-contract client interfaces. Defining them here — rather than
// depending on the sibling contract crates — keeps their exported wasm symbols out
// of this contract's binary, avoiding duplicate-symbol link errors at build time.
#[contractclient(name = "TokenClient")]
pub trait TokenInterface {
    fn transfer(env: Env, from: Address, to: Address, amount: i128);
    fn balance(env: Env, id: Address) -> i128;
}

#[contractclient(name = "OracleClient")]
pub trait OracleInterface {
    fn get_twap(env: Env, asset: Symbol, window_seconds: u64) -> i128;
}

#[contractclient(name = "ReceiptClient")]
pub trait ReceiptInterface {
    fn transfer(env: Env, from: Address, to: Address, crop: Symbol, amount: i128);
    fn balance(env: Env, owner: Address, crop: Symbol) -> i128;
}

#[contractevent]
#[derive(Clone)]
pub struct Supply {
    #[topic]
    pub lp: Address,
    pub shares: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct Withdraw {
    #[topic]
    pub lp: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct Borrowed {
    #[topic]
    pub borrower: Address,
    #[topic]
    pub crop: Symbol,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct Repaid {
    #[topic]
    pub borrower: Address,
    #[topic]
    pub crop: Symbol,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct CollateralWithdrawn {
    #[topic]
    pub borrower: Address,
    #[topic]
    pub crop: Symbol,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct Liquidated {
    #[topic]
    pub liquidator: Address,
    #[topic]
    pub borrower: Address,
    pub crop: Symbol,
    pub debt: i128,
}

const SCALE: i128 = 10_000_000; // 1e7, the 7-decimal fixed-point unit
const BPS: i128 = 10_000;
const SECONDS_PER_YEAR: i128 = 31_536_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum PoolError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    InvalidAmount = 3,
    InvalidConfig = 4,
    Undercollateralized = 5,
    InsufficientLiquidity = 6,
    NoLoan = 7,
    LoanHealthy = 8,
    InsufficientShares = 9,
}

#[contracttype]
#[derive(Clone)]
pub struct Loan {
    pub borrower: Address,
    pub crop: Symbol,
    pub collateral: i128,
    pub principal: i128,
    pub interest_accrued: i128,
    pub last_accrual: u64,
    pub apr_bps: u32,
}

#[contracttype]
#[derive(Clone)]
pub struct PoolParams {
    pub usdc: Address,
    pub oracle: Address,
    pub receipt: Address,
    pub ltv_bps: u32,
    pub liq_threshold_bps: u32,
    pub apr_bps: u32,
    pub twap_window: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct PoolStats {
    pub total_shares: i128,
    pub total_principal: i128,
    pub cash: i128,
    pub total_assets: i128,
    pub price_per_share: i128,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Params,
    TotalShares,
    TotalPrincipal,
    Shares(Address),
    Loan(Address, Symbol),
}

#[contract]
pub struct LendingPoolContract;

#[contractimpl]
impl LendingPoolContract {
    #[allow(clippy::too_many_arguments)]
    pub fn initialize(
        env: Env,
        usdc: Address,
        oracle: Address,
        receipt: Address,
        ltv_bps: u32,
        liq_threshold_bps: u32,
        apr_bps: u32,
        twap_window: u64,
    ) {
        if env.storage().instance().has(&DataKey::Params) {
            panic_with_error!(&env, PoolError::AlreadyInitialized);
        }
        // LTV must sit below the liquidation threshold, which must be below 100%.
        if ltv_bps == 0
            || ltv_bps >= liq_threshold_bps
            || liq_threshold_bps >= BPS as u32
            || twap_window == 0
        {
            panic_with_error!(&env, PoolError::InvalidConfig);
        }
        let params = PoolParams {
            usdc,
            oracle,
            receipt,
            ltv_bps,
            liq_threshold_bps,
            apr_bps,
            twap_window,
        };
        env.storage().instance().set(&DataKey::Params, &params);
        env.storage().instance().set(&DataKey::TotalShares, &0i128);
        env.storage()
            .instance()
            .set(&DataKey::TotalPrincipal, &0i128);
    }

    // ---------------- Liquidity providers ----------------

    /// Supply USDC to the pool and receive shares at the current share price.
    pub fn supply(env: Env, lp: Address, amount: i128) -> i128 {
        lp.require_auth();
        Self::require_positive(&env, amount);
        let params = Self::params(&env);
        let usdc = TokenClient::new(&env, &params.usdc);
        let pool = env.current_contract_address();

        usdc.transfer(&lp, &pool, &amount);

        let total_shares = Self::total_shares(&env);
        let total_principal = Self::total_principal(&env);
        let cash_after = usdc.balance(&pool);
        let assets_before = (cash_after - amount) + total_principal;

        let minted = if total_shares == 0 || assets_before <= 0 {
            amount
        } else {
            amount * total_shares / assets_before
        };

        Self::set_shares(&env, &lp, Self::read_shares(&env, &lp) + minted);
        Self::set_total_shares(&env, total_shares + minted);
        Supply { lp, shares: minted }.publish(&env);
        minted
    }

    /// Redeem `shares` for the underlying USDC at the current share price.
    pub fn withdraw(env: Env, lp: Address, shares: i128) -> i128 {
        lp.require_auth();
        Self::require_positive(&env, shares);
        let params = Self::params(&env);
        let lp_shares = Self::read_shares(&env, &lp);
        if lp_shares < shares {
            panic_with_error!(&env, PoolError::InsufficientShares);
        }
        let usdc = TokenClient::new(&env, &params.usdc);
        let pool = env.current_contract_address();

        let total_shares = Self::total_shares(&env);
        let cash = usdc.balance(&pool);
        let total_assets = cash + Self::total_principal(&env);
        let amount = shares * total_assets / total_shares;
        if amount > cash {
            // Funds are lent out; withdrawal must wait for repayments.
            panic_with_error!(&env, PoolError::InsufficientLiquidity);
        }

        Self::set_shares(&env, &lp, lp_shares - shares);
        Self::set_total_shares(&env, total_shares - shares);
        usdc.transfer(&pool, &lp, &amount);
        Withdraw { lp, amount }.publish(&env);
        amount
    }

    // ---------------- Borrowers ----------------

    /// Lock `collateral_amount` receipt units and borrow `borrow_amount` USDC.
    /// Adds to an existing loan for the same crop if one is open.
    pub fn borrow(
        env: Env,
        borrower: Address,
        crop: Symbol,
        collateral_amount: i128,
        borrow_amount: i128,
    ) {
        borrower.require_auth();
        Self::require_positive(&env, collateral_amount);
        Self::require_positive(&env, borrow_amount);
        let params = Self::params(&env);
        let pool = env.current_contract_address();

        // Custody the collateral first (reverts atomically if health fails later).
        let receipt = ReceiptClient::new(&env, &params.receipt);
        receipt.transfer(&borrower, &pool, &crop, &collateral_amount);

        let mut loan = Self::load_loan(&env, &borrower, &crop).unwrap_or(Loan {
            borrower: borrower.clone(),
            crop: crop.clone(),
            collateral: 0,
            principal: 0,
            interest_accrued: 0,
            last_accrual: env.ledger().timestamp(),
            apr_bps: params.apr_bps,
        });
        accrue(&env, &mut loan);
        loan.collateral += collateral_amount;
        loan.principal += borrow_amount;
        loan.apr_bps = params.apr_bps;

        let debt = loan.principal + loan.interest_accrued;
        let max_borrow = Self::max_borrow_value(&env, &params, &crop, loan.collateral);
        if debt > max_borrow {
            panic_with_error!(&env, PoolError::Undercollateralized);
        }

        let usdc = TokenClient::new(&env, &params.usdc);
        if usdc.balance(&pool) < borrow_amount {
            panic_with_error!(&env, PoolError::InsufficientLiquidity);
        }

        Self::set_total_principal(&env, Self::total_principal(&env) + borrow_amount);
        Self::save_loan(&env, &loan);
        usdc.transfer(&pool, &borrower, &borrow_amount);
        Borrowed {
            borrower,
            crop,
            amount: borrow_amount,
        }
        .publish(&env);
    }

    /// Repay up to the full outstanding debt (interest first, then principal).
    /// Fully repaid loans return all collateral to the borrower and close.
    pub fn repay(env: Env, borrower: Address, crop: Symbol, amount: i128) -> i128 {
        borrower.require_auth();
        Self::require_positive(&env, amount);
        let params = Self::params(&env);
        let pool = env.current_contract_address();
        let mut loan = Self::load_loan(&env, &borrower, &crop)
            .unwrap_or_else(|| panic_with_error!(&env, PoolError::NoLoan));
        accrue(&env, &mut loan);

        let owed = loan.principal + loan.interest_accrued;
        let pay = amount.min(owed);
        let usdc = TokenClient::new(&env, &params.usdc);
        usdc.transfer(&borrower, &pool, &pay);

        let pay_interest = pay.min(loan.interest_accrued);
        loan.interest_accrued -= pay_interest;
        let pay_principal = pay - pay_interest;
        loan.principal -= pay_principal;
        Self::set_total_principal(&env, Self::total_principal(&env) - pay_principal);

        if loan.principal == 0 && loan.interest_accrued == 0 {
            let receipt = ReceiptClient::new(&env, &params.receipt);
            let collateral = loan.collateral;
            if collateral > 0 {
                receipt.transfer(&pool, &borrower, &crop, &collateral);
            }
            Self::remove_loan(&env, &borrower, &crop);
        } else {
            Self::save_loan(&env, &loan);
        }
        Repaid {
            borrower,
            crop,
            amount: pay,
        }
        .publish(&env);
        pay
    }

    /// Withdraw excess collateral while keeping the loan healthy.
    pub fn withdraw_collateral(env: Env, borrower: Address, crop: Symbol, amount: i128) {
        borrower.require_auth();
        Self::require_positive(&env, amount);
        let params = Self::params(&env);
        let pool = env.current_contract_address();
        let mut loan = Self::load_loan(&env, &borrower, &crop)
            .unwrap_or_else(|| panic_with_error!(&env, PoolError::NoLoan));
        accrue(&env, &mut loan);
        if amount > loan.collateral {
            panic_with_error!(&env, PoolError::InvalidAmount);
        }

        let new_collateral = loan.collateral - amount;
        let debt = loan.principal + loan.interest_accrued;
        if debt > 0 {
            let max_borrow = Self::max_borrow_value(&env, &params, &crop, new_collateral);
            if debt > max_borrow {
                panic_with_error!(&env, PoolError::Undercollateralized);
            }
        }
        loan.collateral = new_collateral;

        let receipt = ReceiptClient::new(&env, &params.receipt);
        receipt.transfer(&pool, &borrower, &crop, &amount);

        if loan.principal == 0 && loan.interest_accrued == 0 && loan.collateral == 0 {
            Self::remove_loan(&env, &borrower, &crop);
        } else {
            Self::save_loan(&env, &loan);
        }
        CollateralWithdrawn {
            borrower,
            crop,
            amount,
        }
        .publish(&env);
    }

    /// Liquidate an unhealthy loan: the caller repays the full debt and receives
    /// all of the collateral. Reverts if the loan is still healthy.
    pub fn liquidate(env: Env, liquidator: Address, borrower: Address, crop: Symbol) {
        liquidator.require_auth();
        let params = Self::params(&env);
        let pool = env.current_contract_address();
        let mut loan = Self::load_loan(&env, &borrower, &crop)
            .unwrap_or_else(|| panic_with_error!(&env, PoolError::NoLoan));
        accrue(&env, &mut loan);

        let debt = loan.principal + loan.interest_accrued;
        if debt <= 0 {
            panic_with_error!(&env, PoolError::NoLoan);
        }
        let value = Self::collateral_value(&env, &params, &crop, loan.collateral);
        // Healthy while debt <= value * liq_threshold. Liquidatable otherwise.
        if debt * BPS <= value * (params.liq_threshold_bps as i128) {
            panic_with_error!(&env, PoolError::LoanHealthy);
        }

        let usdc = TokenClient::new(&env, &params.usdc);
        usdc.transfer(&liquidator, &pool, &debt);
        Self::set_total_principal(&env, Self::total_principal(&env) - loan.principal);

        let receipt = ReceiptClient::new(&env, &params.receipt);
        let collateral = loan.collateral;
        receipt.transfer(&pool, &liquidator, &crop, &collateral);
        Self::remove_loan(&env, &borrower, &crop);
        Liquidated {
            liquidator,
            borrower,
            crop,
            debt,
        }
        .publish(&env);
    }

    // ---------------- Views ----------------

    pub fn get_loan(env: Env, borrower: Address, crop: Symbol) -> Option<Loan> {
        Self::load_loan(&env, &borrower, &crop)
    }

    /// Live outstanding debt (principal + interest accrued up to now).
    pub fn loan_debt(env: Env, borrower: Address, crop: Symbol) -> i128 {
        match Self::load_loan(&env, &borrower, &crop) {
            Some(mut loan) => {
                accrue(&env, &mut loan);
                loan.principal + loan.interest_accrued
            }
            None => 0,
        }
    }

    /// Health factor scaled by 1e7 (>= 1e7 is healthy). Returns i128::MAX if no debt.
    pub fn health_factor(env: Env, borrower: Address, crop: Symbol) -> i128 {
        let params = Self::params(&env);
        match Self::load_loan(&env, &borrower, &crop) {
            Some(mut loan) => {
                accrue(&env, &mut loan);
                let debt = loan.principal + loan.interest_accrued;
                if debt <= 0 {
                    return i128::MAX;
                }
                let value = Self::collateral_value(&env, &params, &crop, loan.collateral);
                value * (params.liq_threshold_bps as i128) * SCALE / (BPS * debt)
            }
            None => i128::MAX,
        }
    }

    /// Additional USDC the borrower could draw against current collateral.
    pub fn available_to_borrow(env: Env, borrower: Address, crop: Symbol) -> i128 {
        let params = Self::params(&env);
        match Self::load_loan(&env, &borrower, &crop) {
            Some(mut loan) => {
                accrue(&env, &mut loan);
                let debt = loan.principal + loan.interest_accrued;
                let max_borrow = Self::max_borrow_value(&env, &params, &crop, loan.collateral);
                (max_borrow - debt).max(0)
            }
            None => 0,
        }
    }

    /// Max USDC borrowable if `collateral` units of `crop` were posted right now.
    pub fn quote_borrow(env: Env, crop: Symbol, collateral: i128) -> i128 {
        let params = Self::params(&env);
        Self::max_borrow_value(&env, &params, &crop, collateral)
    }

    pub fn pool_stats(env: Env) -> PoolStats {
        let params = Self::params(&env);
        let usdc = TokenClient::new(&env, &params.usdc);
        let cash = usdc.balance(&env.current_contract_address());
        let total_principal = Self::total_principal(&env);
        let total_shares = Self::total_shares(&env);
        let total_assets = cash + total_principal;
        let price_per_share = if total_shares == 0 {
            SCALE
        } else {
            total_assets * SCALE / total_shares
        };
        PoolStats {
            total_shares,
            total_principal,
            cash,
            total_assets,
            price_per_share,
        }
    }

    pub fn shares_of(env: Env, lp: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Shares(lp))
            .unwrap_or(0)
    }

    /// Current USDC value of an LP's shares.
    pub fn lp_value(env: Env, lp: Address) -> i128 {
        let shares = Self::shares_of(env.clone(), lp);
        if shares == 0 {
            return 0;
        }
        let stats = Self::pool_stats(env);
        shares * stats.price_per_share / SCALE
    }

    pub fn get_params(env: Env) -> PoolParams {
        Self::params(&env)
    }
}

// Internal helpers kept out of the exported contract interface.
impl LendingPoolContract {
    fn params(env: &Env) -> PoolParams {
        env.storage()
            .instance()
            .get(&DataKey::Params)
            .unwrap_or_else(|| panic_with_error!(env, PoolError::NotInitialized))
    }

    fn total_shares(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalShares)
            .unwrap_or(0)
    }

    fn set_total_shares(env: &Env, v: i128) {
        env.storage().instance().set(&DataKey::TotalShares, &v);
    }

    fn total_principal(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalPrincipal)
            .unwrap_or(0)
    }

    fn set_total_principal(env: &Env, v: i128) {
        env.storage().instance().set(&DataKey::TotalPrincipal, &v);
    }

    fn read_shares(env: &Env, lp: &Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Shares(lp.clone()))
            .unwrap_or(0)
    }

    fn set_shares(env: &Env, lp: &Address, v: i128) {
        env.storage()
            .persistent()
            .set(&DataKey::Shares(lp.clone()), &v);
    }

    fn load_loan(env: &Env, borrower: &Address, crop: &Symbol) -> Option<Loan> {
        env.storage()
            .persistent()
            .get(&DataKey::Loan(borrower.clone(), crop.clone()))
    }

    fn save_loan(env: &Env, loan: &Loan) {
        env.storage().persistent().set(
            &DataKey::Loan(loan.borrower.clone(), loan.crop.clone()),
            loan,
        );
    }

    fn remove_loan(env: &Env, borrower: &Address, crop: &Symbol) {
        env.storage()
            .persistent()
            .remove(&DataKey::Loan(borrower.clone(), crop.clone()));
    }

    fn price(env: &Env, params: &PoolParams, crop: &Symbol) -> i128 {
        let oracle = OracleClient::new(env, &params.oracle);
        oracle.get_twap(crop, &params.twap_window)
    }

    /// USDC value of `collateral` receipt units of `crop` (7dp).
    fn collateral_value(env: &Env, params: &PoolParams, crop: &Symbol, collateral: i128) -> i128 {
        collateral * Self::price(env, params, crop) / SCALE
    }

    /// Max borrowable USDC against `collateral` at the configured LTV.
    fn max_borrow_value(env: &Env, params: &PoolParams, crop: &Symbol, collateral: i128) -> i128 {
        Self::collateral_value(env, params, crop, collateral) * (params.ltv_bps as i128) / BPS
    }

    fn require_positive(env: &Env, amount: i128) {
        if amount <= 0 {
            panic_with_error!(env, PoolError::InvalidAmount);
        }
    }
}

fn accrue(env: &Env, loan: &mut Loan) {
    let now = env.ledger().timestamp();
    if loan.principal > 0 && now > loan.last_accrual {
        let dt = (now - loan.last_accrual) as i128;
        let interest = loan.principal * (loan.apr_bps as i128) * dt / (BPS * SECONDS_PER_YEAR);
        loan.interest_accrued += interest;
    }
    loan.last_accrual = now;
}

#[cfg(test)]
mod test;
