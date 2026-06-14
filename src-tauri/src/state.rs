use std::collections::HashMap;
use std::sync::Mutex;

use crate::model::Row;

#[derive(Debug)]
pub struct Report {
    #[allow(dead_code)]
    pub job_name: String,
    pub rows: Vec<Row>,
}

#[derive(Default)]
pub struct AppState {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    next_id: u64,
    reports: HashMap<u64, Report>,
}

impl AppState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert(&self, report: Report) -> u64 {
        let mut inner = self.inner.lock().expect("state mutex poisoned");
        inner.next_id += 1;
        let id = inner.next_id;
        inner.reports.insert(id, report);
        id
    }

    pub fn with_report<F, T>(&self, id: u64, f: F) -> Option<T>
    where
        F: FnOnce(&Report) -> T,
    {
        let inner = self.inner.lock().expect("state mutex poisoned");
        inner.reports.get(&id).map(f)
    }

    pub fn remove(&self, id: u64) -> bool {
        let mut inner = self.inner.lock().expect("state mutex poisoned");
        inner.reports.remove(&id).is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insert_and_lookup() {
        let s = AppState::new();
        let id = s.insert(Report {
            job_name: "job".into(),
            rows: vec![],
        });
        assert!(id > 0);
        let name = s.with_report(id, |r| r.job_name.clone());
        assert_eq!(name.as_deref(), Some("job"));
        assert!(s.remove(id));
        assert!(s.with_report(id, |_| ()).is_none());
    }
}
