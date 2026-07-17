#![cfg(test)]
use super::*;
use soroban_sdk::{symbol_short, testutils::Address as _, Env};

struct Fixture {
    env: Env,
    client: ReceiptContractClient<'static>,
    warehouse: Address,
    inspector: Address,
}

fn setup() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let warehouse = Address::generate(&env);
    let inspector = Address::generate(&env);
    let contract_id = env.register(ReceiptContract, ());
    let client = ReceiptContractClient::new(&env, &contract_id);
    client.initialize(&admin, &warehouse, &inspector);
    Fixture {
        env,
        client,
        warehouse,
        inspector,
    }
}

#[test]
fn test_attest_deposit_mints() {
    let f = setup();
    let farmer = Address::generate(&f.env);
    let wheat = symbol_short!("WHEAT");
    let id = f.client.attest_deposit(
        &f.warehouse,
        &f.inspector,
        &farmer,
        &wheat,
        &1_000_0000000,
        &3000000,
    );
    assert_eq!(id, 0);
    assert_eq!(f.client.balance(&farmer, &wheat), 1_000_0000000);
    assert_eq!(f.client.total_supply(&wheat), 1_000_0000000);
    let deposit = f.client.get_deposit(&0);
    assert_eq!(deposit.quantity, 1_000_0000000);
    assert_eq!(deposit.farmer, farmer);
    assert_eq!(f.client.next_deposit_id(), 1);
}

#[test]
#[should_panic]
fn test_attest_wrong_warehouse() {
    let f = setup();
    let farmer = Address::generate(&f.env);
    let impostor = Address::generate(&f.env);
    f.client.attest_deposit(
        &impostor,
        &f.inspector,
        &farmer,
        &symbol_short!("WHEAT"),
        &1_000_0000000,
        &3000000,
    );
}

#[test]
fn test_transfer_and_partial_redeem() {
    let f = setup();
    let farmer = Address::generate(&f.env);
    let other = Address::generate(&f.env);
    let wheat = symbol_short!("WHEAT");
    f.client
        .attest_deposit(&f.warehouse, &f.inspector, &farmer, &wheat, &1_000_0000000, &3000000);

    f.client.transfer(&farmer, &other, &wheat, &400_0000000);
    assert_eq!(f.client.balance(&farmer, &wheat), 600_0000000);
    assert_eq!(f.client.balance(&other, &wheat), 400_0000000);

    // Partial physical redemption burns supply.
    f.client.redeem(&f.warehouse, &farmer, &wheat, &100_0000000);
    assert_eq!(f.client.balance(&farmer, &wheat), 500_0000000);
    assert_eq!(f.client.total_supply(&wheat), 900_0000000);
}

#[test]
fn test_demo_faucet() {
    let f = setup();
    let user = Address::generate(&f.env);
    let wheat = symbol_short!("WHEAT");
    f.client.request_demo_receipt(&user, &wheat);
    assert_eq!(f.client.balance(&user, &wheat), 1_000_0000000);
}

#[test]
#[should_panic]
fn test_demo_faucet_cap() {
    let f = setup();
    let user = Address::generate(&f.env);
    let wheat = symbol_short!("WHEAT");
    // Cap is 5,000 kg; 6 calls of 1,000 exceeds it.
    for _ in 0..6 {
        f.client.request_demo_receipt(&user, &wheat);
    }
}
