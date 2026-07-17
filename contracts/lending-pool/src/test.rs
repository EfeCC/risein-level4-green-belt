#![cfg(test)]
use super::*;
use oracle::{OracleContract, OracleContractClient};
use receipt::{ReceiptContract, ReceiptContractClient};
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Ledger as _},
    Env, String,
};
use token::{TokenContract, TokenContractClient};

const WHEAT: Symbol = symbol_short!("WHEAT");
const USDC: i128 = 10_000_000; // 1.00 with 7 decimals

struct World {
    env: Env,
    pool: LendingPoolContractClient<'static>,
    pool_id: Address,
    usdc: TokenContractClient<'static>,
    oracle: OracleContractClient<'static>,
    receipt: ReceiptContractClient<'static>,
}

fn set_time(env: &Env, t: u64) {
    env.ledger().with_mut(|li| li.timestamp = t);
}

fn setup() -> World {
    let env = Env::default();
    env.mock_all_auths();
    set_time(&env, 1000);

    let admin = Address::generate(&env);
    let warehouse = Address::generate(&env);
    let inspector = Address::generate(&env);
    let oracle_admin = Address::generate(&env);

    let usdc_id = env.register(TokenContract, ());
    let usdc = TokenContractClient::new(&env, &usdc_id);
    usdc.initialize(
        &admin,
        &7u32,
        &String::from_str(&env, "HarvestLink USD"),
        &String::from_str(&env, "hlUSDC"),
    );

    let oracle_id = env.register(OracleContract, ());
    let oracle = OracleContractClient::new(&env, &oracle_id);
    oracle.initialize(&oracle_admin, &5000u32, &10u32);

    let receipt_id = env.register(ReceiptContract, ());
    let receipt = ReceiptContractClient::new(&env, &receipt_id);
    receipt.initialize(&admin, &warehouse, &inspector);

    let pool_id = env.register(LendingPoolContract, ());
    let pool = LendingPoolContractClient::new(&env, &pool_id);
    // LTV 65%, liquidation threshold 80%, APR 12%, TWAP window 600s.
    pool.initialize(
        &usdc_id, &oracle_id, &receipt_id, &6500u32, &8000u32, &1200u32, &600u64,
    );

    World {
        env,
        pool,
        pool_id,
        usdc,
        oracle,
        receipt,
    }
}

#[test]
fn test_full_borrow_repay_cycle() {
    let w = setup();
    let env = &w.env;

    // Wheat at $0.30/kg.
    w.oracle.set_price(&WHEAT, &3_000_000);

    // LP supplies 10,000 USDC and receives 1:1 shares on the first deposit.
    let lp = Address::generate(env);
    w.usdc.faucet(&lp, &(10_000 * USDC));
    let minted = w.pool.supply(&lp, &(10_000 * USDC));
    assert_eq!(minted, 10_000 * USDC);

    // Farmer self-onboards a 1,000 kg demo receipt.
    let farmer = Address::generate(env);
    w.receipt.request_demo_receipt(&farmer, &WHEAT);
    assert_eq!(w.receipt.balance(&farmer, &WHEAT), 1_000 * USDC);

    // 1,000 kg * $0.30 = $300 value; max borrow at 65% LTV = $195.
    assert_eq!(w.pool.quote_borrow(&WHEAT, &(1_000 * USDC)), 195 * USDC);

    // Borrow $150 against the full 1,000 kg.
    w.pool.borrow(&farmer, &WHEAT, &(1_000 * USDC), &(150 * USDC));
    assert_eq!(w.usdc.balance(&farmer), 150 * USDC);
    assert_eq!(w.usdc.balance(&w.pool_id), 9_850 * USDC);
    assert_eq!(w.receipt.balance(&w.pool_id, &WHEAT), 1_000 * USDC);
    assert_eq!(w.receipt.balance(&farmer, &WHEAT), 0);
    let loan = w.pool.get_loan(&farmer, &WHEAT).unwrap();
    assert_eq!(loan.principal, 150 * USDC);

    // Fast-forward exactly one year: 12% of $150 = $18 interest.
    set_time(env, 1000 + 31_536_000);
    assert_eq!(w.pool.loan_debt(&farmer, &WHEAT), 168 * USDC);

    // Repay in full (overpayment is capped to the amount owed).
    w.usdc.faucet(&farmer, &(18 * USDC));
    let paid = w.pool.repay(&farmer, &WHEAT, &(500 * USDC));
    assert_eq!(paid, 168 * USDC);
    assert_eq!(w.receipt.balance(&farmer, &WHEAT), 1_000 * USDC);
    assert!(w.pool.get_loan(&farmer, &WHEAT).is_none());

    // Interest realized -> LP position grew by $18.
    assert_eq!(w.pool.lp_value(&lp), 10_018 * USDC);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")] // Undercollateralized
fn test_borrow_over_ltv_reverts() {
    let w = setup();
    let env = &w.env;
    w.oracle.set_price(&WHEAT, &3_000_000);
    let lp = Address::generate(env);
    w.usdc.faucet(&lp, &(10_000 * USDC));
    w.pool.supply(&lp, &(10_000 * USDC));

    let farmer = Address::generate(env);
    w.receipt.request_demo_receipt(&farmer, &WHEAT);
    // Max is $195; requesting $250 must revert.
    w.pool.borrow(&farmer, &WHEAT, &(1_000 * USDC), &(250 * USDC));
}

#[test]
fn test_liquidation_when_price_falls() {
    let w = setup();
    let env = &w.env;

    set_time(env, 1000);
    w.oracle.set_price(&WHEAT, &3_000_000); // $0.30

    let lp = Address::generate(env);
    w.usdc.faucet(&lp, &(10_000 * USDC));
    w.pool.supply(&lp, &(10_000 * USDC));

    let farmer = Address::generate(env);
    w.receipt.request_demo_receipt(&farmer, &WHEAT);
    // Borrow the max $195 so a modest price drop makes it unhealthy.
    w.pool.borrow(&farmer, &WHEAT, &(1_000 * USDC), &(195 * USDC));
    assert!(w.pool.health_factor(&farmer, &WHEAT) >= SCALE);

    // Price falls to $0.20 and TWAP window rolls forward to reflect it.
    set_time(env, 2000);
    w.oracle.set_price(&WHEAT, &2_000_000);
    set_time(env, 2600);
    // Collateral now ~$200 vs ~$195 debt -> below the 80% liq threshold.
    assert!(w.pool.health_factor(&farmer, &WHEAT) < SCALE);

    let liquidator = Address::generate(env);
    let debt = w.pool.loan_debt(&farmer, &WHEAT);
    w.usdc.faucet(&liquidator, &debt);
    w.pool.liquidate(&liquidator, &farmer, &WHEAT);

    // Liquidator seized all collateral; loan is closed.
    assert_eq!(w.receipt.balance(&liquidator, &WHEAT), 1_000 * USDC);
    assert!(w.pool.get_loan(&farmer, &WHEAT).is_none());
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")] // LoanHealthy
fn test_cannot_liquidate_healthy_loan() {
    let w = setup();
    let env = &w.env;
    w.oracle.set_price(&WHEAT, &3_000_000);
    let lp = Address::generate(env);
    w.usdc.faucet(&lp, &(10_000 * USDC));
    w.pool.supply(&lp, &(10_000 * USDC));
    let farmer = Address::generate(env);
    w.receipt.request_demo_receipt(&farmer, &WHEAT);
    w.pool.borrow(&farmer, &WHEAT, &(1_000 * USDC), &(100 * USDC));

    let liquidator = Address::generate(env);
    w.usdc.faucet(&liquidator, &(100 * USDC));
    w.pool.liquidate(&liquidator, &farmer, &WHEAT);
}

#[test]
fn test_lp_supply_and_withdraw() {
    let w = setup();
    let env = &w.env;
    let lp = Address::generate(env);
    w.usdc.faucet(&lp, &(10_000 * USDC));
    w.pool.supply(&lp, &(10_000 * USDC));

    // No loans -> price per share is 1.0, withdraw returns USDC 1:1.
    let out = w.pool.withdraw(&lp, &(4_000 * USDC));
    assert_eq!(out, 4_000 * USDC);
    assert_eq!(w.usdc.balance(&lp), 4_000 * USDC);
    assert_eq!(w.pool.shares_of(&lp), 6_000 * USDC);
}

#[test]
fn test_partial_collateral_withdraw() {
    let w = setup();
    let env = &w.env;
    w.oracle.set_price(&WHEAT, &3_000_000);
    let lp = Address::generate(env);
    w.usdc.faucet(&lp, &(10_000 * USDC));
    w.pool.supply(&lp, &(10_000 * USDC));

    let farmer = Address::generate(env);
    w.receipt.request_demo_receipt(&farmer, &WHEAT);
    // Borrow $100 against 1,000 kg ($300 value); plenty of headroom.
    w.pool.borrow(&farmer, &WHEAT, &(1_000 * USDC), &(100 * USDC));

    // Withdraw 400 kg back; remaining 600 kg * $0.30 * 65% = $117 >= $100 debt.
    w.pool.withdraw_collateral(&farmer, &WHEAT, &(400 * USDC));
    assert_eq!(w.receipt.balance(&farmer, &WHEAT), 400 * USDC);
    let loan = w.pool.get_loan(&farmer, &WHEAT).unwrap();
    assert_eq!(loan.collateral, 600 * USDC);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")] // Undercollateralized
fn test_collateral_withdraw_blocked_when_unsafe() {
    let w = setup();
    let env = &w.env;
    w.oracle.set_price(&WHEAT, &3_000_000);
    let lp = Address::generate(env);
    w.usdc.faucet(&lp, &(10_000 * USDC));
    w.pool.supply(&lp, &(10_000 * USDC));
    let farmer = Address::generate(env);
    w.receipt.request_demo_receipt(&farmer, &WHEAT);
    w.pool.borrow(&farmer, &WHEAT, &(1_000 * USDC), &(190 * USDC));
    // Removing 900 kg would leave $100*0.65=$19.5 headroom vs $190 debt.
    w.pool.withdraw_collateral(&farmer, &WHEAT, &(900 * USDC));
}
