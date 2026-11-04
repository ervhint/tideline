use near_sdk::json_types::U64;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, require, AccountId, PanicOnDefault};

const MAX_READINGS_BYTES: usize = 256;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Record {
    pub archive_sha256: String,
    pub readings: String,
    /// Nanoseconds since the Unix epoch, as a string in JSON (it is larger than 2^53).
    pub block_timestamp: U64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Attest {
    owner: AccountId,
    records: LookupMap<String, Record>,
    last_day: Option<String>,
}

/// A real calendar date as YYYY-MM-DD. A record is permanent, so a typo must not get in.
fn is_day(s: &str) -> bool {
    let b = s.as_bytes();
    let shape = b.len() == 10
        && b.iter().enumerate().all(|(i, c)| match i {
            4 | 7 => *c == b'-',
            _ => c.is_ascii_digit(),
        });
    if !shape {
        return false;
    }
    let num = |r: std::ops::Range<usize>| s[r].parse::<u32>().unwrap_or(0);
    let (year, month, day) = (num(0..4), num(5..7), num(8..10));
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    (1..=days_in_month).contains(&day)
}

fn is_sha256_hex(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}

#[near]
impl Attest {
    /// Only the contract account itself can init, so nobody can take ownership
    /// between deploy and init.
    #[init]
    #[private]
    pub fn new(owner: AccountId) -> Self {
        Self {
            owner,
            records: LookupMap::new(b"r"),
            last_day: None,
        }
    }

    /// Owner only, write once per day, no deposit. Nothing edits or deletes a record.
    pub fn attest(&mut self, day: String, archive_sha256: String, readings: String) {
        require!(
            env::predecessor_account_id() == self.owner,
            "only the owner can attest"
        );
        require!(
            env::attached_deposit().is_zero(),
            "this contract takes no deposit"
        );
        require!(is_day(&day), "day must be YYYY-MM-DD");
        require!(
            is_sha256_hex(&archive_sha256),
            "archive_sha256 must be 64 lowercase hex characters"
        );
        require!(
            readings.len() <= MAX_READINGS_BYTES,
            "readings must be at most 256 bytes"
        );
        require!(!self.records.contains_key(&day), "day already attested");

        let record = Record {
            archive_sha256,
            readings,
            block_timestamp: U64(env::block_timestamp()),
        };
        // ISO dates sort the same as strings, so the latest day is the largest one.
        if self.last_day.as_ref().map_or(true, |d| day > *d) {
            self.last_day = Some(day.clone());
        }
        env::log_str(&format!(
            "EVENT_JSON:{}",
            near_sdk::serde_json::json!({
                "standard": "tideline_attest",
                "version": "1.0.0",
                "event": "attested",
                "data": [{
                    "day": day,
                    "archive_sha256": record.archive_sha256,
                    "readings": record.readings,
                }],
            })
        ));
        self.records.insert(day, record);
    }

    pub fn get(&self, day: String) -> Option<Record> {
        self.records.get(&day).cloned()
    }

    pub fn last_day(&self) -> Option<String> {
        self.last_day.clone()
    }

    pub fn owner(&self) -> AccountId {
        self.owner.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{get_logs, VMContextBuilder};
    use near_sdk::{testing_env, NearToken};

    const HASH: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const HASH2: &str = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

    fn acct(s: &str) -> AccountId {
        s.parse().unwrap()
    }

    fn as_caller(who: &str, deposit: u128) {
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(acct(who))
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .block_timestamp(1_780_000_000_000_000_000)
            .build());
    }

    fn fresh() -> Attest {
        as_caller("owner.testnet", 0);
        Attest::new(acct("owner.testnet"))
    }

    #[test]
    fn owner_attests_and_reads_back() {
        let mut c = fresh();
        c.attest("2026-11-01".into(), HASH.into(), "v*=13.7B".into());
        let r = c.get("2026-11-01".into()).unwrap();
        assert_eq!(r.archive_sha256, HASH);
        assert_eq!(r.readings, "v*=13.7B");
        assert_eq!(r.block_timestamp, U64(1_780_000_000_000_000_000));
        assert_eq!(c.last_day(), Some("2026-11-01".to_string()));
        assert!(c.get("2026-11-02".into()).is_none());
        assert!(get_logs()[0].starts_with("EVENT_JSON:"));
        assert!(get_logs()[0].contains("\"event\":\"attested\""));
    }

    #[test]
    #[should_panic(expected = "day already attested")]
    fn inv1_second_write_for_a_day_fails() {
        let mut c = fresh();
        c.attest("2026-11-01".into(), HASH.into(), "a".into());
        c.attest("2026-11-01".into(), HASH2.into(), "b".into());
    }

    #[test]
    fn inv1_first_record_survives_a_rejected_rewrite() {
        let mut c = fresh();
        c.attest("2026-11-01".into(), HASH.into(), "a".into());
        let before = c.get("2026-11-01".into());
        let rewrite = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.attest("2026-11-01".into(), HASH2.into(), "b".into())
        }));
        assert!(rewrite.is_err());
        assert_eq!(c.get("2026-11-01".into()), before);
    }

    #[test]
    #[should_panic(expected = "only the owner can attest")]
    fn inv2_non_owner_cannot_write() {
        let mut c = fresh();
        as_caller("mallory.testnet", 0);
        c.attest("2026-11-01".into(), HASH.into(), "a".into());
    }

    #[test]
    #[should_panic(expected = "takes no deposit")]
    fn inv3_deposit_is_refused() {
        let mut c = fresh();
        as_caller("owner.testnet", 1);
        c.attest("2026-11-01".into(), HASH.into(), "a".into());
    }

    #[test]
    #[should_panic(expected = "YYYY-MM-DD")]
    fn bad_day_is_refused() {
        fresh().attest("2026-1-01".into(), HASH.into(), "a".into());
    }

    #[test]
    fn only_real_dates_pass() {
        for good in ["2026-11-01", "2026-02-28", "2028-02-29", "2000-02-29", "2026-12-31"] {
            assert!(is_day(good), "{good}");
        }
        for bad in [
            "2026-13-01", "2026-00-10", "2026-11-00", "2026-11-31", "2026-02-29", "1900-02-29",
            "2026/11/01", "2026-11-1", "2026-11-011", "",
        ] {
            assert!(!is_day(bad), "{bad}");
        }
    }

    #[test]
    #[should_panic(expected = "64 lowercase hex")]
    fn uppercase_hash_is_refused() {
        fresh().attest("2026-11-01".into(), HASH.to_uppercase(), "a".into());
    }

    #[test]
    #[should_panic(expected = "at most 256 bytes")]
    fn long_readings_are_refused() {
        fresh().attest("2026-11-01".into(), HASH.into(), "x".repeat(257));
    }

    #[test]
    fn readings_of_exactly_256_bytes_are_accepted() {
        let mut c = fresh();
        c.attest("2026-11-01".into(), HASH.into(), "x".repeat(256));
        assert!(c.get("2026-11-01".into()).is_some());
    }

    /// INV-1 to INV-3 over a long random mix of calls, checked against a plain map.
    #[test]
    fn invariants_hold_over_random_calls() {
        let mut c = fresh();
        let mut model = std::collections::HashMap::new();
        let mut seed: u64 = 0x9E37_79B9_7F4A_7C15;
        let mut next = move |n: u64| {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            seed % n
        };
        for i in 0..500 {
            let day = format!("2026-11-{:02}", next(28) + 1);
            let hash = format!("{:064x}", i);
            let owner = next(3) > 0;
            let deposit = u128::from(next(4) == 0);
            as_caller(if owner { "owner.testnet" } else { "mallory.testnet" }, deposit);

            let call = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                c.attest(day.clone(), hash.clone(), String::new())
            }));
            let should_pass = owner && deposit == 0 && !model.contains_key(&day);
            assert_eq!(call.is_ok(), should_pass, "call {i}");
            if should_pass {
                model.insert(day, hash);
            }
            for (d, h) in &model {
                assert_eq!(c.get(d.clone()).unwrap().archive_sha256, *h);
            }
            assert_eq!(c.last_day().as_ref(), model.keys().max());
        }
    }

    #[test]
    fn last_day_is_the_latest_even_when_written_out_of_order() {
        let mut c = fresh();
        c.attest("2026-11-03".into(), HASH.into(), "".into());
        c.attest("2026-11-02".into(), HASH2.into(), "".into());
        assert_eq!(c.last_day(), Some("2026-11-03".to_string()));
        assert_eq!(c.owner(), acct("owner.testnet"));
    }
}
