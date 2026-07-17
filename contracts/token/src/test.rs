#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Env};

fn setup() -> (Env, TokenContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);
    client.initialize(
        &admin,
        &7u32,
        &String::from_str(&env, "HarvestLink USD"),
        &String::from_str(&env, "hlUSDC"),
    );
    (env, client, admin)
}

#[test]
fn test_metadata() {
    let (_env, client, _admin) = setup();
    assert_eq!(client.decimals(), 7);
}

#[test]
fn test_mint_and_balance() {
    let (env, client, _admin) = setup();
    let user = Address::generate(&env);
    client.mint(&user, &1_000_0000000);
    assert_eq!(client.balance(&user), 1_000_0000000);
}

#[test]
fn test_transfer() {
    let (env, client, _admin) = setup();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    client.mint(&a, &500_0000000);
    client.transfer(&a, &b, &200_0000000);
    assert_eq!(client.balance(&a), 300_0000000);
    assert_eq!(client.balance(&b), 200_0000000);
}

#[test]
fn test_faucet() {
    let (env, client, _admin) = setup();
    let user = Address::generate(&env);
    client.faucet(&user, &1_000_0000000);
    assert_eq!(client.balance(&user), 1_000_0000000);
}

#[test]
#[should_panic]
fn test_faucet_over_limit() {
    let (env, client, _admin) = setup();
    let user = Address::generate(&env);
    // Above FAUCET_MAX_PER_CALL -> panics.
    client.faucet(&user, &1_000_000_0000000);
}

#[test]
#[should_panic]
fn test_transfer_insufficient() {
    let (env, client, _admin) = setup();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    client.mint(&a, &10_0000000);
    client.transfer(&a, &b, &50_0000000);
}

#[test]
#[should_panic]
fn test_double_init() {
    let (env, client, admin) = setup();
    client.initialize(
        &admin,
        &7u32,
        &String::from_str(&env, "x"),
        &String::from_str(&env, "y"),
    );
}
