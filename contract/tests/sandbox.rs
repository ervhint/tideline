// Runs the real compiled contract on a throwaway NEAR sandbox, because unit tests
// skip the generated wasm wrapper (#[private], #[init], the non-payable check) and
// never see a failed call roll back. Build the wasm first: cargo near build.
use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde_json::{json, Value};

const WASM: &str = "target/near/tideline_attest.wasm";
const DAY: &str = "2026-11-01";
const HASH: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const HASH2: &str = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

async fn deployed() -> anyhow::Result<(Contract, Account)> {
    let worker = near_workspaces::sandbox().await?;
    let contract = worker.dev_deploy(&std::fs::read(WASM)?).await?;
    let mallory = worker.dev_create_account().await?;
    Ok((contract, mallory))
}

async fn init(contract: &Contract) -> anyhow::Result<()> {
    contract
        .call("new")
        .args_json(json!({ "owner": contract.id() }))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

async fn get(contract: &Contract, day: &str) -> anyhow::Result<Value> {
    Ok(contract.view("get").args_json(json!({ "day": day })).await?.json()?)
}

fn args(hash: &str) -> Value {
    json!({ "day": DAY, "archive_sha256": hash, "readings": "q1=bull" })
}

#[tokio::test]
async fn only_the_account_itself_can_init_and_only_once() -> anyhow::Result<()> {
    let (contract, mallory) = deployed().await?;
    // Otherwise anyone could take ownership between deploy and init.
    let stolen = mallory
        .call(contract.id(), "new")
        .args_json(json!({ "owner": mallory.id() }))
        .transact()
        .await?;
    assert!(stolen.is_failure());
    init(&contract).await?;
    let again = contract
        .call("new")
        .args_json(json!({ "owner": mallory.id() }))
        .transact()
        .await?;
    assert!(again.is_failure());
    let owner: String = contract.view("owner").await?.json()?;
    assert_eq!(owner, contract.id().to_string());
    Ok(())
}

#[tokio::test]
async fn attest_stores_logs_and_is_write_once() -> anyhow::Result<()> {
    let (contract, _) = deployed().await?;
    init(&contract).await?;

    let first = contract.call("attest").args_json(args(HASH)).transact().await?;
    assert!(first.is_success());
    let log = first.logs().join("");
    let event: Value = serde_json::from_str(log.strip_prefix("EVENT_JSON:").unwrap())?;
    assert_eq!(event["event"], "attested");
    assert_eq!(event["data"][0]["archive_sha256"], HASH);

    let stored = get(&contract, DAY).await?;
    assert_eq!(stored["archive_sha256"], HASH);
    assert_eq!(stored["readings"], "q1=bull");
    assert!(stored["block_timestamp"].is_string());
    let last: Option<String> = contract.view("last_day").await?.json()?;
    assert_eq!(last.as_deref(), Some(DAY));

    // INV-1, AC-1.4
    let rewrite = contract.call("attest").args_json(args(HASH2)).transact().await?;
    assert!(rewrite.is_failure());
    assert_eq!(get(&contract, DAY).await?, stored);
    Ok(())
}

#[tokio::test]
async fn non_owner_and_deposit_fail_and_change_nothing() -> anyhow::Result<()> {
    let (contract, mallory) = deployed().await?;
    init(&contract).await?;

    // INV-2, AC-1.4
    let intruder = mallory
        .call(contract.id(), "attest")
        .args_json(args(HASH))
        .transact()
        .await?;
    assert!(intruder.is_failure());

    // INV-3
    let paid = contract
        .call("attest")
        .args_json(args(HASH))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;
    assert!(paid.is_failure());

    assert_eq!(get(&contract, DAY).await?, Value::Null);
    let last: Option<String> = contract.view("last_day").await?.json()?;
    assert_eq!(last, None);
    Ok(())
}
