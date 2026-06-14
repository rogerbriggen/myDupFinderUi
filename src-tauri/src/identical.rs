use std::collections::{BTreeMap, HashMap, HashSet};

use crate::model::{parent_of, split_folder_and_name, Category, IdenticalFolderPair, Row, Source};

/// Detect pairs of folders (one rooted in Base, one rooted in Second) whose
/// entire subtree is composed of files paired across the two sides via
/// `Duplicate` or `Moved` rows, with matching directory structure.
///
/// Algorithm (bottom-up, per AGENTS.md §4.3):
///   A folder `F` on the Base side is identical to a folder `G` on the Second
///   side iff:
///     * every immediate file child of `F` has a `Duplicate` or `Moved`
///       partner whose row is an immediate file child of `G` with the SAME
///       filename, AND vice-versa;
///     * `F` and `G` have matching subfolder names, and each child subfolder
///       of `F` is recursively identical to the same-named child of `G`;
///     * neither subtree contains a `Unique`, `Missing`, `New` or `Changed`
///       row.
///
/// Returned pairs are maximal (a parent shadows its children) and sorted by
/// `total_size` descending.
pub fn find_identical_folders(rows: &[Row]) -> Vec<IdenticalFolderPair> {
    let tree_base = build_folder_tree(rows, Source::Base);
    let tree_second = build_folder_tree(rows, Source::Second);
    let pair_for_base = build_pair_map(rows);
    let forbidden_base = forbidden_folders(rows, Source::Base);
    let forbidden_second = forbidden_folders(rows, Source::Second);

    let mut memo: HashMap<(String, String), bool> = HashMap::new();
    let mut pairs: Vec<IdenticalFolderPair> = Vec::new();

    let candidate_bases: Vec<String> = tree_base.keys().cloned().collect();
    for base_folder in &candidate_bases {
        if let Some(second_folder) =
            candidate_second_folder(base_folder, &tree_base, &pair_for_base)
        {
            if is_identical(
                base_folder,
                &second_folder,
                &tree_base,
                &tree_second,
                &pair_for_base,
                &forbidden_base,
                &forbidden_second,
                &mut memo,
            ) {
                let count = subtree_file_count(base_folder, &tree_base);
                let size = subtree_size(rows, base_folder, Source::Base);
                pairs.push(IdenticalFolderPair {
                    folder_a: base_folder.clone(),
                    folder_b: second_folder,
                    file_count: count,
                    total_size: size,
                });
            }
        }
    }

    // Keep maximal pairs only: drop (A, B) if a strict-ancestor pair (A', B')
    // is also present.
    let pair_set: HashSet<(String, String)> = pairs
        .iter()
        .map(|p| (p.folder_a.clone(), p.folder_b.clone()))
        .collect();
    pairs.retain(|p| !has_ancestor_pair(&p.folder_a, &p.folder_b, &pair_set));

    pairs.sort_by_key(|p| std::cmp::Reverse(p.total_size));
    pairs
}

#[derive(Default, Debug, Clone)]
struct FolderNode {
    /// filename -> Row index in the slice of rows passed in
    files: BTreeMap<String, usize>,
    /// child folder name -> full child path
    subfolders: BTreeMap<String, String>,
}

fn build_folder_tree(rows: &[Row], source: Source) -> HashMap<String, FolderNode> {
    let mut tree: HashMap<String, FolderNode> = HashMap::new();
    for (idx, row) in rows.iter().enumerate() {
        if row.source != source {
            continue;
        }
        let (folder, name) = split_folder_and_name(&row.filename_and_path);
        tree.entry(folder.clone())
            .or_default()
            .files
            .insert(name, idx);

        let mut child = folder.clone();
        while let Some(parent) = parent_of(&child) {
            let (_, child_name) = split_folder_and_name(&child);
            tree.entry(parent.clone())
                .or_default()
                .subfolders
                .insert(child_name, child.clone());
            child = parent;
        }
    }
    tree
}

fn build_pair_map(rows: &[Row]) -> HashMap<String, String> {
    let mut by_group: HashMap<i32, (Option<usize>, Option<usize>)> = HashMap::new();
    for (idx, row) in rows.iter().enumerate() {
        if !matches!(row.category, Category::Duplicate | Category::Moved) {
            continue;
        }
        let slot = by_group.entry(row.group_id).or_insert((None, None));
        match row.source {
            Source::Base => {
                if slot.0.is_none() {
                    slot.0 = Some(idx);
                }
            }
            Source::Second => {
                if slot.1.is_none() {
                    slot.1 = Some(idx);
                }
            }
        }
    }
    let mut map = HashMap::new();
    for (b, s) in by_group.values() {
        if let (Some(b_idx), Some(s_idx)) = (b, s) {
            map.insert(
                rows[*b_idx].filename_and_path.clone(),
                rows[*s_idx].filename_and_path.clone(),
            );
        }
    }
    map
}

fn forbidden_folders(rows: &[Row], source: Source) -> HashSet<String> {
    let mut set = HashSet::new();
    for row in rows {
        if row.source != source {
            continue;
        }
        if !matches!(
            row.category,
            Category::Unique | Category::Missing | Category::New | Category::Changed
        ) {
            continue;
        }
        let (folder, _) = split_folder_and_name(&row.filename_and_path);
        if !folder.is_empty() {
            set.insert(folder.clone());
            let mut cur = parent_of(&folder);
            while let Some(p) = cur {
                if !set.insert(p.clone()) {
                    break;
                }
                cur = parent_of(&p);
            }
        }
    }
    set
}

fn candidate_second_folder(
    base_folder: &str,
    tree_base: &HashMap<String, FolderNode>,
    pair_for_base: &HashMap<String, String>,
) -> Option<String> {
    let node = tree_base.get(base_folder)?;
    // Pick any file under the subtree and use its pair partner's folder.
    let mut stack = vec![base_folder.to_string()];
    while let Some(folder) = stack.pop() {
        if let Some(n) = tree_base.get(&folder) {
            for filename in n.files.keys() {
                let base_path = join_path(&folder, filename);
                if let Some(second_path) = pair_for_base.get(&base_path) {
                    // Walk up the second path by the same number of components we
                    // descended on the base side from `base_folder`.
                    let depth = depth_below(base_folder, &folder);
                    let mut anchor = parent_of(second_path)?;
                    for _ in 0..depth {
                        anchor = parent_of(&anchor)?;
                    }
                    return Some(anchor);
                }
            }
            for child in n.subfolders.values() {
                stack.push(child.clone());
            }
        }
    }
    let _ = node;
    None
}

fn depth_below(ancestor: &str, descendant: &str) -> usize {
    if ancestor == descendant {
        return 0;
    }
    let mut depth = 0usize;
    let mut cur = descendant.to_string();
    while let Some(p) = parent_of(&cur) {
        depth += 1;
        if p == ancestor {
            return depth;
        }
        cur = p;
    }
    depth
}

#[allow(clippy::too_many_arguments)]
fn is_identical(
    base_folder: &str,
    second_folder: &str,
    tree_base: &HashMap<String, FolderNode>,
    tree_second: &HashMap<String, FolderNode>,
    pair_for_base: &HashMap<String, String>,
    forbidden_base: &HashSet<String>,
    forbidden_second: &HashSet<String>,
    memo: &mut HashMap<(String, String), bool>,
) -> bool {
    let key = (base_folder.to_string(), second_folder.to_string());
    if let Some(&v) = memo.get(&key) {
        return v;
    }

    if base_folder.is_empty() || second_folder.is_empty() {
        memo.insert(key, false);
        return false;
    }
    if forbidden_base.contains(base_folder) || forbidden_second.contains(second_folder) {
        memo.insert(key, false);
        return false;
    }

    let (bn, sn) = match (tree_base.get(base_folder), tree_second.get(second_folder)) {
        (Some(b), Some(s)) => (b, s),
        _ => {
            memo.insert(key, false);
            return false;
        }
    };

    if bn.files.len() != sn.files.len() {
        memo.insert(key, false);
        return false;
    }
    for filename in bn.files.keys() {
        if !sn.files.contains_key(filename) {
            memo.insert(key, false);
            return false;
        }
        let base_path = join_path(base_folder, filename);
        let expected_second_path = join_path(second_folder, filename);
        match pair_for_base.get(&base_path) {
            Some(p) if *p == expected_second_path => {}
            _ => {
                memo.insert(key, false);
                return false;
            }
        }
    }

    if bn.subfolders.len() != sn.subfolders.len() {
        memo.insert(key, false);
        return false;
    }
    let base_children: Vec<(String, String)> = bn
        .subfolders
        .iter()
        .map(|(n, p)| (n.clone(), p.clone()))
        .collect();
    for (name, base_child_path) in base_children {
        let second_child_path = match sn.subfolders.get(&name) {
            Some(p) => p.clone(),
            None => {
                memo.insert(key, false);
                return false;
            }
        };
        if !is_identical(
            &base_child_path,
            &second_child_path,
            tree_base,
            tree_second,
            pair_for_base,
            forbidden_base,
            forbidden_second,
            memo,
        ) {
            memo.insert(key, false);
            return false;
        }
    }

    memo.insert(key, true);
    true
}

fn subtree_file_count(folder: &str, tree: &HashMap<String, FolderNode>) -> usize {
    let mut count = 0usize;
    let mut stack = vec![folder.to_string()];
    while let Some(f) = stack.pop() {
        if let Some(node) = tree.get(&f) {
            count += node.files.len();
            for child in node.subfolders.values() {
                stack.push(child.clone());
            }
        }
    }
    count
}

fn subtree_size(rows: &[Row], folder: &str, source: Source) -> i64 {
    rows.iter()
        .filter(|r| r.source == source && is_under(&r.filename_and_path, folder))
        .map(|r| r.file_size)
        .sum()
}

fn has_ancestor_pair(folder_a: &str, folder_b: &str, set: &HashSet<(String, String)>) -> bool {
    let mut cur_a = parent_of(folder_a);
    let mut cur_b = parent_of(folder_b);
    while let (Some(a), Some(b)) = (cur_a.clone(), cur_b.clone()) {
        if set.contains(&(a.clone(), b.clone())) {
            return true;
        }
        cur_a = parent_of(&a);
        cur_b = parent_of(&b);
    }
    false
}

fn join_path(folder: &str, name: &str) -> String {
    if folder.is_empty() {
        return name.to_string();
    }
    let sep = if folder.contains('\\') { '\\' } else { '/' };
    format!("{}{}{}", folder, sep, name)
}

fn is_under(path: &str, folder: &str) -> bool {
    if folder.is_empty() {
        return true;
    }
    if !path.starts_with(folder) {
        return false;
    }
    let next = &path[folder.len()..];
    next.starts_with('\\') || next.starts_with('/')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(path: &str, hash: &str, cat: Category, src: Source, gid: i32, size: i64) -> Row {
        Row {
            filename_and_path: path.to_string(),
            file_size: size,
            file_sha512_hash: hash.to_string(),
            category: cat,
            source: src,
            group_id: gid,
        }
    }

    #[test]
    fn detects_simple_identical_pair() {
        let rows = vec![
            r(
                "C:\\a\\b\\one.txt",
                "H1",
                Category::Duplicate,
                Source::Base,
                1,
                100,
            ),
            r(
                "D:\\x\\y\\one.txt",
                "H1",
                Category::Duplicate,
                Source::Second,
                1,
                100,
            ),
            r(
                "C:\\a\\b\\two.txt",
                "H2",
                Category::Duplicate,
                Source::Base,
                2,
                200,
            ),
            r(
                "D:\\x\\y\\two.txt",
                "H2",
                Category::Duplicate,
                Source::Second,
                2,
                200,
            ),
        ];
        let pairs = find_identical_folders(&rows);
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].folder_a, "C:\\a\\b");
        assert_eq!(pairs[0].folder_b, "D:\\x\\y");
        assert_eq!(pairs[0].file_count, 2);
        assert_eq!(pairs[0].total_size, 300);
    }

    #[test]
    fn rejects_when_missing_in_subtree() {
        let rows = vec![
            r(
                "C:\\a\\b\\one.txt",
                "H1",
                Category::Duplicate,
                Source::Base,
                1,
                100,
            ),
            r(
                "D:\\x\\y\\one.txt",
                "H1",
                Category::Duplicate,
                Source::Second,
                1,
                100,
            ),
            r(
                "C:\\a\\b\\miss.txt",
                "H2",
                Category::Missing,
                Source::Base,
                2,
                200,
            ),
        ];
        let pairs = find_identical_folders(&rows);
        assert!(pairs.is_empty());
    }

    #[test]
    fn picks_maximal_pair_over_subfolder() {
        let rows = vec![
            r(
                "C:\\a\\b\\sub\\one.txt",
                "H1",
                Category::Duplicate,
                Source::Base,
                1,
                100,
            ),
            r(
                "D:\\x\\y\\sub\\one.txt",
                "H1",
                Category::Duplicate,
                Source::Second,
                1,
                100,
            ),
            r(
                "C:\\a\\b\\two.txt",
                "H2",
                Category::Duplicate,
                Source::Base,
                2,
                200,
            ),
            r(
                "D:\\x\\y\\two.txt",
                "H2",
                Category::Duplicate,
                Source::Second,
                2,
                200,
            ),
        ];
        let pairs = find_identical_folders(&rows);
        let roots: Vec<_> = pairs
            .iter()
            .map(|p| (p.folder_a.as_str(), p.folder_b.as_str()))
            .collect();
        assert!(roots.contains(&("C:\\a\\b", "D:\\x\\y")));
        assert!(!roots.contains(&("C:\\a\\b\\sub", "D:\\x\\y\\sub")));
    }

    #[test]
    fn whole_lot_fixture_runs_without_panic() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("testdata")
            .join("Demo DiffFindDupsTheWholeLot dupReport.csv");
        let rows = crate::csv_parser::parse_dup_report(&path).expect("parse");
        let pairs = find_identical_folders(&rows);
        assert!(pairs.len() <= rows.len());
    }
}
