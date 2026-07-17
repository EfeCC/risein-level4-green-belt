#![no_std]
//! HarvestLink price oracle.
//!
//! On testnet this stands in for the Reflector oracle network: an authorized
//! updater pushes commodity/FX prices and the contract exposes a **time-weighted
//! average price (TWAP)** to consumers. The lending pool reads the TWAP — never the
//! raw spot price — so a single anomalous update cannot be used to manipulate
//! collateral valuations. This is a deliberate response to the February 2026
//! Stellar lending exploit that stemmed from naive spot-price oracle usage.
//!
//! Two defenses layer here:
//!   1. **Sanity bounds** — a new price that deviates more than `max_deviation_bps`
//!      from the previous one is rejected outright.
//!   2. **TWAP smoothing** — consumers value collateral against a time-weighted
//!      average, so even an accepted outlier is diluted across the window.
//!
//! Prices use a fixed-point scale of 7 decimals (1_0000000 == 1.00 USD).

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, Address,
    Env, Symbol, Vec,
};

#[contractevent]
#[derive(Clone)]
pub struct PriceUpdated {
    #[topic]
    pub asset: Symbol,
    pub price: i128,
}

pub const PRICE_DECIMALS: u32 = 7;
const BPS_DENOMINATOR: i128 = 10_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum OracleError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    InvalidPrice = 4,
    NoPriceData = 5,
    PriceDeviationTooHigh = 6,
    InvalidConfig = 7,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceSample {
    pub timestamp: u64,
    pub price: i128,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    MaxDeviationBps,
    MaxSamples,
    Samples(Symbol),
}

#[contract]
pub struct OracleContract;

#[contractimpl]
impl OracleContract {
    /// Initialize with an updater `admin`, the maximum accepted per-update price
    /// deviation (in basis points) and the number of samples retained per asset.
    pub fn initialize(env: Env, admin: Address, max_deviation_bps: u32, max_samples: u32) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, OracleError::AlreadyInitialized);
        }
        if max_deviation_bps == 0 || max_samples == 0 {
            panic_with_error!(&env, OracleError::InvalidConfig);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::MaxDeviationBps, &max_deviation_bps);
        env.storage()
            .instance()
            .set(&DataKey::MaxSamples, &max_samples);
    }

    /// Push a new price for `asset`. Rejected if it deviates from the last price by
    /// more than the configured bound. The first price for an asset is unbounded.
    pub fn set_price(env: Env, asset: Symbol, price: i128) {
        Self::require_admin(&env);
        if price <= 0 {
            panic_with_error!(&env, OracleError::InvalidPrice);
        }

        let mut samples = Self::read_samples(&env, &asset);
        if let Some(last) = samples.last() {
            Self::enforce_deviation_bound(&env, last.price, price);
        }

        let max_samples: u32 = env
            .storage()
            .instance()
            .get(&DataKey::MaxSamples)
            .unwrap_or(24);
        samples.push_back(PriceSample {
            timestamp: env.ledger().timestamp(),
            price,
        });
        while samples.len() > max_samples {
            samples.pop_front();
        }
        env.storage()
            .persistent()
            .set(&DataKey::Samples(asset.clone()), &samples);
        PriceUpdated { asset, price }.publish(&env);
    }

    /// Latest spot price for `asset`. Prefer `get_twap` for valuation.
    pub fn get_price(env: Env, asset: Symbol) -> i128 {
        Self::read_samples(&env, &asset)
            .last()
            .unwrap_or_else(|| panic_with_error!(&env, OracleError::NoPriceData))
            .price
    }

    /// Time-weighted average price over the trailing `window_seconds`.
    /// Falls back to the latest price if the window contains no elapsed time.
    pub fn get_twap(env: Env, asset: Symbol, window_seconds: u64) -> i128 {
        let samples = Self::read_samples(&env, &asset);
        let n = samples.len();
        if n == 0 {
            panic_with_error!(&env, OracleError::NoPriceData);
        }
        let now = env.ledger().timestamp();
        let window_start = now.saturating_sub(window_seconds);

        let mut weighted_sum: i128 = 0;
        let mut total_weight: i128 = 0;
        for i in 0..n {
            let sample = samples.get(i).unwrap();
            let interval_start = sample.timestamp;
            let interval_end = if i + 1 < n {
                samples.get(i + 1).unwrap().timestamp
            } else {
                now
            };
            // Clip the interval this price was "live" for into the window.
            let start = core::cmp::max(interval_start, window_start);
            let end = core::cmp::max(start, interval_end.min(now));
            let weight = (end - start) as i128;
            if weight > 0 {
                weighted_sum += sample.price * weight;
                total_weight += weight;
            }
        }

        if total_weight == 0 {
            // No elapsed time inside the window (e.g. a single fresh sample).
            samples.last().unwrap().price
        } else {
            weighted_sum / total_weight
        }
    }

    /// All retained samples for `asset` (oldest first) — for dashboards/audits.
    pub fn get_samples(env: Env, asset: Symbol) -> Vec<PriceSample> {
        Self::read_samples(&env, &asset)
    }

    pub fn last_updated(env: Env, asset: Symbol) -> u64 {
        Self::read_samples(&env, &asset)
            .last()
            .map(|s| s.timestamp)
            .unwrap_or(0)
    }

    pub fn max_deviation_bps(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::MaxDeviationBps)
            .unwrap_or(0)
    }

    pub fn get_admin(env: Env) -> Address {
        Self::admin_addr(&env)
    }

    /// Rotate the updater key (admin only).
    pub fn set_admin(env: Env, new_admin: Address) {
        Self::require_admin(&env);
        env.storage().instance().set(&DataKey::Admin, &new_admin);
    }
}

// Internal helpers kept out of the exported contract interface.
impl OracleContract {
    fn admin_addr(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, OracleError::NotInitialized))
    }

    fn require_admin(env: &Env) {
        Self::admin_addr(env).require_auth();
    }

    fn read_samples(env: &Env, asset: &Symbol) -> Vec<PriceSample> {
        env.storage()
            .persistent()
            .get(&DataKey::Samples(asset.clone()))
            .unwrap_or_else(|| Vec::new(env))
    }

    fn enforce_deviation_bound(env: &Env, last: i128, next: i128) {
        let max_dev: u32 = env
            .storage()
            .instance()
            .get(&DataKey::MaxDeviationBps)
            .unwrap_or(0);
        let diff = (next - last).abs();
        // diff / last > max_dev / 10000  <=>  diff * 10000 > max_dev * last
        if diff * BPS_DENOMINATOR > (max_dev as i128) * last {
            panic_with_error!(env, OracleError::PriceDeviationTooHigh);
        }
    }
}

#[cfg(test)]
mod test;
