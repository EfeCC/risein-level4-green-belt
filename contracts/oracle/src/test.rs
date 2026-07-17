#![cfg(test)]
use super::*;
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Ledger as _},
    Env,
};

fn setup() -> (Env, OracleContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(OracleContract, ());
    let client = OracleContractClient::new(&env, &contract_id);
    // 50% max per-update deviation, keep 10 samples.
    client.initialize(&admin, &5000u32, &10u32);
    (env, client)
}

fn set_time(env: &Env, t: u64) {
    env.ledger().with_mut(|li| li.timestamp = t);
}

#[test]
fn test_set_and_get_price() {
    let (_env, client) = setup();
    let wheat = symbol_short!("WHEAT");
    client.set_price(&wheat, &100_0000000);
    assert_eq!(client.get_price(&wheat), 100_0000000);
}

#[test]
fn test_twap_time_weighted() {
    let (env, client) = setup();
    let wheat = symbol_short!("WHEAT");

    set_time(&env, 0);
    client.set_price(&wheat, &100_0000000);

    set_time(&env, 100);
    client.set_price(&wheat, &140_0000000); // +40%, within bound

    set_time(&env, 200);
    // [0,100) @ 100  +  [100,200) @ 140  => (100*100 + 140*100)/200 = 120
    assert_eq!(client.get_twap(&wheat, &10_000), 120_0000000);
}

#[test]
fn test_twap_single_sample_fallback() {
    let (env, client) = setup();
    let wheat = symbol_short!("WHEAT");
    set_time(&env, 500);
    client.set_price(&wheat, &42_0000000);
    // Window has no elapsed time -> falls back to latest price.
    assert_eq!(client.get_twap(&wheat, &10_000), 42_0000000);
}

#[test]
#[should_panic]
fn test_deviation_bound_rejects_spike() {
    let (_env, client) = setup();
    let wheat = symbol_short!("WHEAT");
    client.set_price(&wheat, &100_0000000);
    // +200% in one step, exceeds the 50% bound -> rejected.
    client.set_price(&wheat, &300_0000000);
}

#[test]
fn test_deviation_bound_allows_gradual_moves() {
    let (env, client) = setup();
    let wheat = symbol_short!("WHEAT");
    set_time(&env, 0);
    client.set_price(&wheat, &100_0000000);
    set_time(&env, 10);
    client.set_price(&wheat, &145_0000000); // +45% ok
    set_time(&env, 20);
    client.set_price(&wheat, &90_0000000); // -37.9% ok
    assert_eq!(client.get_price(&wheat), 90_0000000);
}

#[test]
#[should_panic]
fn test_no_price_data() {
    let (_env, client) = setup();
    client.get_price(&symbol_short!("CORN"));
}
