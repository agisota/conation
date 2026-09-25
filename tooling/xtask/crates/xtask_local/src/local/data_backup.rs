//! Quiesced, per-instance Docker-volume backup and restore.
//!
//! Unlike `snapshot`, this archive captures the live local stack state. Its
//! manifest intentionally binds the data to the exact source code/schema,
//! Docker platform, stateful image IDs, auth-key fingerprint, and host-port map.

use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
#[cfg(unix)]
use std::os::fd::AsRawFd;
#[cfg(unix)]
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, bail, ensure};
use clap::Args;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::instance::{Instance, Port};
use super::stage::Stage;

const FORMAT: u32 = 1;
const ARCHIVE_HELPER_IMAGE: &str = "debian:bookworm-slim";
const STATEFUL_SERVICES: [&str; 7] = [
    "postgres",
    "redis",
    "search",
    "kafka",
    "fusionauth",
    "db",
    "localstack",
];

#[derive(Args, Clone, Default)]
pub struct BackupArgs {
    #[command(flatten)]
    pub instance: super::cli::InstanceArgs,
    /// New, private directory for the backup bundle. It must not already exist.
    #[arg(long, value_name = "DIRECTORY")]
    pub output: PathBuf,
}
#[derive(Args, Clone, Default)]
pub struct OperatorHandoffArgs {
    #[command(flatten)]
    pub instance: super::cli::InstanceArgs,
    /// Target UID; all cross-UID transfers are unsupported and fail closed.
    #[arg(long, value_name = "UID")]
    pub to_uid: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ArchiveRecord {
    name: String,
    sha256: String,
    bytes: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Manifest {
    format: u32,
    created_unix: u64,
    source_instance: String,
    source_port_map: Vec<u16>,
    code_revision: String,
    source_tree_clean: bool,
    app_version: String,
    migration_sha256: String,
    docker_platform: String,
    auth_key_fingerprint: String,
    mcp_credentials_key_fingerprint: String,
    stateful_image_ids: BTreeMap<String, String>,
    archives: Vec<ArchiveRecord>,
}
pub struct ValidatedBundle {
    path: PathBuf,
    manifest: Manifest,
}

impl ValidatedBundle {
    pub fn code_revision(&self) -> &str {
        &self.manifest.code_revision
    }
}

impl Drop for ValidatedBundle {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}


#[derive(Clone, Debug, Serialize, Deserialize)]
struct Container {
    id: String,
    service: String,
    state: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
enum InterruptedOperation {
    Backup,
    Migration,
}

#[derive(Deserialize, Serialize)]
struct RecoveryRecord {
    operation: InterruptedOperation,
    containers: Vec<Container>,
    #[serde(default)]
    source_stack_state_path: Option<PathBuf>,
}

pub fn code_revision() -> Result<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(super::repo_root())
        .args(["rev-parse", "HEAD"])
        .output()
        .context("reading the repository revision")?;
    ensure!(output.status.success(), "could not read the repository revision");
    let revision = String::from_utf8(output.stdout).context("repository revision was not UTF-8")?;
    let revision = revision.trim().to_owned();
    ensure!(!revision.is_empty(), "repository revision is empty");
    Ok(revision)
}

pub fn working_tree_is_clean() -> Result<bool> {
    let output = Command::new("git")
        .arg("-C")
        .arg(super::repo_root())
        .args(["status", "--porcelain", "--untracked-files=all"])
        .output()
        .context("checking repository worktree state")?;
    ensure!(output.status.success(), "could not check repository worktree state");
    Ok(output.stdout.is_empty())
}

fn migration_fingerprint() -> Result<String> {
    let root = super::workspace_root().join("crates/macro_db_client/migrations");
    let mut paths = Vec::new();
    collect_files(&root, &root, &mut paths)?;
    paths.sort();
    ensure!(!paths.is_empty(), "no database migrations found");

    let mut hash = Sha256::new();
    for relative in paths {
        let name = relative.to_string_lossy();
        hash.update(name.as_bytes());
        hash.update([0]);
        hash_reader(&mut hash, File::open(root.join(&relative))?)?;
        hash.update([0]);
    }
    Ok(hex(&hash.finalize()))
}

fn collect_files(root: &Path, path: &Path, out: &mut Vec<PathBuf>) -> Result<()> {
    for entry in fs::read_dir(path).with_context(|| format!("reading {}", path.display()))? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            collect_files(root, &entry.path(), out)?;
        } else if file_type.is_file() {
            out.push(
                entry
                    .path()
                    .strip_prefix(root)
                    .context("migration path escaped its root")?
                    .to_path_buf(),
            );
        }
    }
    Ok(())
}

fn hash_reader(hash: &mut Sha256, mut reader: impl Read) -> Result<u64> {
    let mut buffer = [0u8; 64 * 1024];
    let mut total = 0u64;
    loop {
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
        total = total
            .checked_add(count as u64)
            .context("file size overflow while hashing")?;
    }
    Ok(total)
}

fn hash_file(path: &Path) -> Result<(String, u64)> {
    let mut hash = Sha256::new();
    let bytes = hash_reader(&mut hash, File::open(path).with_context(|| format!("opening {}", path.display()))?)?;
    Ok((hex(&hash.finalize()), bytes))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn mcp_credentials_key_fingerprint(env: &BTreeMap<String, String>) -> Result<String> {
    let key = env
        .get("MCP_CREDENTIALS_KEY_SECRET_NAME")
        .filter(|key| !key.trim().is_empty())
        .context("resolved MCP credentials encryption key is missing or empty")?;
    Ok(mcp_key_fingerprint(key))
}

fn mcp_key_fingerprint(key: &str) -> String {
    hex(&Sha256::digest(key.as_bytes()))
}

pub fn ensure_mcp_credentials_key_fingerprint_matches(
    instance: &Instance,
    recorded: Option<&str>,
    env: &BTreeMap<String, String>,
) -> Result<String> {
    let resolved = mcp_credentials_key_fingerprint(env)?;
    let running = running_mcp_credentials_key_fingerprint(instance)?;
    ensure!(
        running == resolved,
        "resolved MCP credentials encryption key differs from the running service configuration"
    );
    if let Some(recorded) = recorded {
        ensure!(
            recorded == running,
            "running MCP credentials encryption key differs from the key recorded for this stack"
        );
    }
    Ok(resolved)
}

fn running_mcp_credentials_key_fingerprint(instance: &Instance) -> Result<String> {
    let containers = project_containers(instance)?;
    let mut matches = containers
        .iter()
        .filter(|container| container.service == "document_cognition_service");
    let container = matches
        .next()
        .context("stack has no document_cognition_service container for MCP key verification")?;
    ensure!(
        matches.next().is_none() && container.state == "running",
        "expected exactly one running document_cognition_service for MCP key verification"
    );
    let values = container_environment(container)?;
    let key = values
        .iter()
        .find_map(|entry| entry.strip_prefix("MCP_CREDENTIALS_KEY_SECRET_NAME="))
        .filter(|key| !key.trim().is_empty())
        .context("running document_cognition_service has no MCP credentials encryption key")?;
    Ok(mcp_key_fingerprint(key))
}

fn container_environment(container: &Container) -> Result<Vec<String>> {
    let output = Command::new("docker")
        .args(["inspect", "--format", "{{json .Config.Env}}", &container.id])
        .output()
        .with_context(|| format!("inspecting {} environment", container.service))?;
    ensure!(output.status.success(), "could not inspect {} environment", container.service);
    serde_json::from_slice(&output.stdout)
        .with_context(|| format!("parsing {} environment", container.service))
}

fn app_version() -> Result<String> {
    fs::read_to_string(super::repo_root().join("VERSION"))
        .context("reading repository VERSION")
        .map(|value| value.trim().to_owned())
}

fn docker_platform() -> Result<String> {
    Ok(super::arch::detect()?.docker_platform.to_owned())
}

fn port_map(instance: &Instance) -> Vec<u16> {
    Port::all().map(|port| instance.port(port)).collect()
}

fn volumes(instance: &Instance) -> [(&'static str, String); 7] {
    [
        ("postgres.tar.gz", instance.volume_postgres()),
        ("redis.tar.gz", instance.volume_redis()),
        ("opensearch.tar.gz", instance.volume_opensearch()),
        ("kafka.tar.gz", instance.volume_kafka()),
        ("fusionauth-db.tar.gz", instance.volume_fusionauth_db()),
        ("fusionauth-config.tar.gz", instance.volume_fusionauth_config()),
        ("localstack.tar.gz", instance.volume_localstack_data()),
    ]
}

fn expected_volume_mounts(instance: &Instance) -> [(&'static str, String, &'static str); 7] {
    [
        ("postgres", instance.volume_postgres(), "/var/lib/postgresql"),
        ("redis", instance.volume_redis(), "/data"),
        ("search", instance.volume_opensearch(), "/usr/share/opensearch/data"),
        ("kafka", instance.volume_kafka(), "/var/lib/kafka/data"),
        ("db", instance.volume_fusionauth_db(), "/var/lib/postgresql/data"),
        ("fusionauth", instance.volume_fusionauth_config(), "/usr/local/fusionauth/config"),
        ("localstack", instance.volume_localstack_data(), "/var/lib/localstack"),
    ]
}

struct StackDataPaths {
    lock_root: PathBuf,
    daemon_id: String,
    project_name: String,
    operation_lock_path: PathBuf,
    owner_path: PathBuf,
}

fn lock_paths(instance: &Instance) -> Result<StackDataPaths> {
    let output = Command::new("docker")
        .args(["info", "--format", "{{.ID}}"])
        .output()
        .context("identifying the active Docker daemon for stack locking")?;
    ensure!(output.status.success(), "could not identify the active Docker daemon for stack locking");
    let daemon_id = String::from_utf8(output.stdout)?.trim().to_owned();
    ensure!(!daemon_id.is_empty(), "Docker daemon returned an empty engine ID");
    let project_name = instance.project_name().to_owned();
    let lock_root = shared_lock_root()?;
    let mut hash = Sha256::new();
    hash.update(daemon_id.as_bytes());
    hash.update([0]);
    hash.update(project_name.as_bytes());
    let resource_id = hex(&hash.finalize());
    let operation_lock_path =
        lock_root.join(format!("macro-stack-data-operation-{resource_id}.lock"));
    let owner_path = lock_root.join(format!("macro-stack-data-owner-{resource_id}.json"));
    Ok(StackDataPaths {
        lock_root,
        daemon_id,
        project_name,
        operation_lock_path,
        owner_path,
    })
}

impl StackDataPaths {
    fn recovery_path(&self, uid: u32, create_directory: bool) -> Result<PathBuf> {
        let mut hash = Sha256::new();
        hash.update(self.daemon_id.as_bytes());
        hash.update([0]);
        hash.update(self.project_name.as_bytes());
        hash.update([0]);
        hash.update(uid.to_le_bytes());
        let directory = self.lock_root.join(format!("macro-stack-data-locks-{uid}"));
        if create_directory {
            ensure_private_lock_directory(&directory, uid)?;
        } else {
            match fs::symlink_metadata(&directory) {
                Ok(metadata) => {
                    ensure!(
                        metadata.file_type().is_dir(),
                        "stack data lock path {} is not a directory",
                        directory.display()
                    );
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::MetadataExt;
                        ensure!(metadata.uid() == uid && metadata.mode() & 0o077 == 0,
                            "stack data lock directory {} has unsafe ownership or permissions",
                            directory.display()
                        );
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(error).with_context(|| format!("checking {}", directory.display())),
            }
        }
        Ok(directory.join(format!("{}.recovery.json", hex(&hash.finalize()))))
    }
}

fn ensure_private_lock_directory(path: &Path, uid: u32) -> Result<()> {
    match fs::create_dir(path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            let metadata = fs::symlink_metadata(path)
                .with_context(|| format!("checking lock directory {}", path.display()))?;
            ensure!(
                metadata.file_type().is_dir(),
                "stack data lock path {} is not a directory",
                path.display()
            );
            #[cfg(unix)]
            {
                use std::os::unix::fs::MetadataExt;
                ensure!(
                    metadata.uid() == uid,
                    "stack data lock directory {} is not owned by the current host UID",
                    path.display()
                );
            }
        }
        Err(error) => {
            return Err(error).with_context(|| format!("creating lock directory {}", path.display()));
        }
    }
    set_private_dir_mode(path)
        .with_context(|| format!("securing lock directory {}", path.display()))
}

const OPERATOR_BINDING_VERSION: u32 = 1;
#[derive(Debug, Deserialize, Serialize)]
struct OperatorBinding {
    format_version: u32,
    uid: u32,
    host_id: String,
}

fn operator_uid() -> u32 {
    #[cfg(unix)]
    {
        unsafe { libc::geteuid() as u32 }
    }
    #[cfg(not(unix))]
    {
        host_user_ids().0
    }
}

fn validate_operator_binding(recorded: &OperatorBinding, current: &OperatorBinding) -> Result<()> {
    ensure!(
        recorded.uid == current.uid,
        "stack data operations for this Docker daemon/project are designated to host UID {}; current UID {} must not operate them",
        recorded.uid,
        current.uid
    );
    ensure!(
        recorded.host_id == current.host_id,
        "stack data operations for this Docker daemon/project are bound to another host; cross-host locking is unsupported"
    );
    Ok(())
}

fn read_operator_binding_file(path: &Path) -> Result<OperatorBinding> {
    let metadata = fs::symlink_metadata(path)
        .with_context(|| format!("checking operator binding {}", path.display()))?;
    ensure!(
        metadata.file_type().is_file(),
        "Docker daemon/project operator binding is not a regular file"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        ensure!(
            metadata.mode() & 0o444 == 0o444 && metadata.mode() & 0o022 == 0,
            "Docker daemon/project operator binding has unsafe permissions"
        );
    }
    let mut file = open_regular_file(path)?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .context("reading the Docker daemon/project operator binding")?;
    let value: serde_json::Value = serde_json::from_slice(&bytes)
        .context("parsing the Docker daemon/project operator binding")?;
    let object = value
        .as_object()
        .context("Docker daemon/project operator binding is not an object")?;
    ensure!(
        object
            .get("format_version")
            .and_then(serde_json::Value::as_u64)
            == Some(u64::from(OPERATOR_BINDING_VERSION)),
        "unversioned operator binding is unsupported; refusing possible ownership rollback"
    );
    ensure!(
        !["generation", "writer_uid", "previous_sha256"]
            .iter()
            .any(|field| object.contains_key(*field)),
        "legacy cross-UID operator binding format is unsupported; refusing possible ownership rollback"
    );
    let recorded: OperatorBinding = serde_json::from_value(value)
        .context("parsing the Docker daemon/project operator binding")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        ensure!(
            metadata.uid() == recorded.uid,
            "Docker daemon/project operator binding owner does not match its designated UID"
        );
    }
    Ok(recorded)
}

fn publish_operator_binding(path: &Path, binding: &OperatorBinding) -> Result<()> {
    let parent = path.parent().context("operator binding path has no parent")?;
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
    let filename = path
        .file_name()
        .context("operator binding path has no filename")?
        .to_string_lossy();
    let temporary = parent.join(format!(
        ".{filename}.tmp-{}-{}-{nonce}",
        operator_uid(),
        std::process::id()
    ));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    }
    let mut file = options
        .open(&temporary)
        .with_context(|| format!("creating operator binding staging file {}", temporary.display()))?;
    let publish = (|| -> Result<()> {
        serde_json::to_writer(&mut file, binding)
            .context("serializing the Docker daemon/project operator binding")?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            file.set_permissions(fs::Permissions::from_mode(0o644))?;
        }
        file.sync_all()
            .context("syncing the staged Docker daemon/project operator binding")?;
        drop(file);
        fs::hard_link(&temporary, path)
            .with_context(|| format!("publishing operator binding {}", path.display()))?;
        fs::remove_file(&temporary)
            .with_context(|| format!("removing {}", temporary.display()))?;
        sync_directory(parent)
    })();
    if publish.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    publish
}

fn ensure_no_legacy_handoff_records(path: &Path) -> Result<()> {
    let parent = path.parent().context("operator binding path has no parent")?;
    let stem = path
        .file_stem()
        .context("operator binding path has no filename")?
        .to_string_lossy();
    let handoff_prefix = format!("{stem}-handoff-");
    for entry in fs::read_dir(parent)
        .with_context(|| format!("checking legacy operator handoffs in {}", parent.display()))?
    {
        let entry = entry
            .with_context(|| format!("reading entries in {}", parent.display()))?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        ensure!(
            !name.starts_with(&handoff_prefix) || !name.ends_with(".json"),
            "legacy cross-UID operator handoff records exist; refusing to risk ownership rollback"
        );
    }
    Ok(())
}


fn ensure_operator_binding(
    path: &Path,
    current: &OperatorBinding,
) -> Result<OperatorBinding> {
    ensure_no_legacy_handoff_records(path)?;
    match fs::symlink_metadata(path) {
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let initial = OperatorBinding {
                format_version: OPERATOR_BINDING_VERSION,
                uid: current.uid,
                host_id: current.host_id.clone(),
            };
            publish_operator_binding(path, &initial)?;
        }
        Err(error) => {
            return Err(error)
                .with_context(|| format!("checking operator binding {}", path.display()));
        }
    }
    let recorded = read_operator_binding_file(path)
        .with_context(|| format!("validating existing operator binding {}", path.display()))?;
    validate_operator_binding(&recorded, current)?;
    Ok(recorded)
}

pub fn handoff_operator(_args: &OperatorHandoffArgs) -> Result<()> {
    bail!("cross-UID portable stack-data handoff is unsupported; use the designated host UID")
}

// Metadata selects the owner of the private lock inode before opening it. The
// binding's serialized host identity is still validated while holding flock.
#[cfg(unix)]
fn operator_binding_owner_uid(path: &Path, current_uid: u32) -> Result<u32> {
    use std::os::unix::fs::MetadataExt;
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            ensure!(
                metadata.file_type().is_file() && metadata.mode() & 0o022 == 0,
                "Docker daemon/project operator binding has unsafe type or permissions"
            );
            Ok(metadata.uid())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(current_uid),
        Err(error) => Err(error).with_context(|| format!("checking {}", path.display())),
    }
}

#[cfg(not(unix))]
fn operator_binding_owner_uid(_path: &Path, current_uid: u32) -> Result<u32> {
    Ok(current_uid)
}

fn open_existing_operation_lock_file(
    path: &Path,
    expected_owner_uid: u32,
    current_uid: u32,
) -> Result<File> {
    let mut open = OpenOptions::new();
    open.read(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        open.custom_flags(libc::O_NOFOLLOW);
    }
    let file = open
        .open(path)
        .with_context(|| format!("opening private stack-data lock {}", path.display()))?;
    let mut metadata = file.metadata()?;
    ensure!(
        metadata.is_file() && metadata.len() == 0,
        "stack-data lock is not an empty regular file"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        ensure!(
            metadata.uid() == expected_owner_uid && metadata.nlink() == 1,
            "stack-data lock owner is not the designated UID or the lock is hard-linked"
        );
        if metadata.mode() & 0o777 != 0o600 {
            ensure!(
                metadata.uid() == current_uid,
                "stack-data lock has unsafe permissions"
            );
            file.set_permissions(fs::Permissions::from_mode(0o600))?;
            metadata = file.metadata()?;
        }
        ensure!(
            metadata.mode() & 0o777 == 0o600,
            "stack-data lock has unsafe permissions"
        );
    }
    Ok(file)
}

// The pinned UID is the only supported local operator. Keeping this inode
// private means another UID cannot unlink it from the sticky /var/tmp parent.
fn open_operation_lock_file(
    path: &Path,
    expected_owner_uid: u32,
    current_uid: u32,
) -> Result<File> {
    ensure!(
        expected_owner_uid == current_uid,
        "portable stack-data operations are pinned to host UID {expected_owner_uid}; current UID {current_uid} is unsupported"
    );
    let mut create = OpenOptions::new();
    create.read(true).write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        create.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    }
    match create.open(path) {
        Ok(file) => {
            #[cfg(unix)]
            {
                use std::os::unix::fs::{MetadataExt, PermissionsExt};
                file.set_permissions(fs::Permissions::from_mode(0o600))?;
                let metadata = file.metadata()?;
                ensure!(
                    metadata.is_file()
                        && metadata.len() == 0
                        && metadata.nlink() == 1
                        && metadata.uid() == expected_owner_uid
                        && metadata.mode() & 0o777 == 0o600,
                    "new stack-data lock must be a private empty single-link file owned by the designated UID"
                );
                file.sync_all()?;
            }
            ensure!(file.metadata()?.is_file(), "stack-data lock is not a regular file");
            sync_directory(path.parent().context("shared lock path has no parent")?)?;
            Ok(file)
        }
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            open_existing_operation_lock_file(path, expected_owner_uid, current_uid)
        }
        Err(error) => Err(error)
            .with_context(|| format!("creating stack-data lock {}", path.display())),
    }
}

fn acquire_operation_lock(
    path: &Path,
    expected_owner_uid: u32,
    current_uid: u32,
    operation: &str,
) -> Result<File> {
    let file = open_operation_lock_file(path, expected_owner_uid, current_uid)?;
    #[cfg(unix)]
    {
        let result = unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) };
        ensure!(
            result == 0,
            "another portable stack-data operation is active; refusing {operation}"
        );
    }
    #[cfg(not(unix))]
    {
        let _ = operation;
        bail!("shared stack-data locking requires a supported Unix host")
    }
    Ok(file)
}

#[cfg(unix)]
fn validate_operation_lock_owner(
    lock_file: &File,
    owner_path: &Path,
    current_uid: u32,
) -> Result<()> {
    use std::os::unix::fs::MetadataExt;
    let lock_owner = lock_file.metadata()?.uid();
    match fs::symlink_metadata(owner_path) {
        Ok(metadata) => {
            ensure!(
                metadata.file_type().is_file() && metadata.uid() == lock_owner,
                "shared stack-data lock owner does not match the daemon/project binding owner"
            );
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => ensure!(
            lock_owner == current_uid,
            "shared stack-data lock was pre-created by another host UID; refusing to claim this Docker project"
        ),
        Err(error) => {
            return Err(error).with_context(|| format!("checking {}", owner_path.display()));
        }
    }
    Ok(())
}

#[cfg(not(unix))]
fn validate_operation_lock_owner(
    _lock_file: &File,
    _owner_path: &Path,
    _current_uid: u32,
) -> Result<()> {
    bail!("shared stack-data locking requires a supported Unix host")
}

#[cfg(unix)]
fn shared_lock_root() -> Result<PathBuf> {
    use std::os::unix::fs::MetadataExt;
    let root = fs::canonicalize("/var/tmp").context("opening the shared host lock directory")?;
    let metadata = fs::metadata(&root).context("checking the shared host lock directory")?;
    ensure!(
        metadata.is_dir()
            && metadata.uid() == 0
            && metadata.mode() & 0o1000 != 0
            && metadata.mode() & 0o002 != 0,
        "/var/tmp must be a root-owned, sticky, world-writable directory for the host-wide stack-data lock and operator binding"
    );
    Ok(root)
}

#[cfg(not(unix))]
fn shared_lock_root() -> Result<PathBuf> {
    bail!("safe stack-data operator binding requires a Unix host with a sticky /var/tmp")
}

fn host_identity() -> Result<String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("sysctl")
            .args(["-n", "kern.uuid"])
            .output()
            .context("reading the macOS host identity")?;
        ensure!(output.status.success(), "could not read the macOS host identity");
        let raw = String::from_utf8(output.stdout)?.trim().to_owned();
        ensure!(!raw.is_empty(), "macOS returned an empty host identity");
        return Ok(hex(&Sha256::digest(raw.as_bytes())));
    }
    #[cfg(target_os = "linux")]
    {
        let raw = fs::read_to_string("/etc/machine-id")
            .context("reading the Linux host identity")?;
        let raw = raw.trim();
        ensure!(!raw.is_empty(), "Linux returned an empty host identity");
        return Ok(hex(&Sha256::digest(raw.as_bytes())));
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        bail!("stack-data operator binding is supported only on macOS and Linux hosts")
    }
}

pub struct StackDataLock {
    _file: File,
    recovery_path: PathBuf,
    #[cfg(not(unix))]
    path: PathBuf,
}

impl StackDataLock {
    fn acquire(instance: &Instance, operation: &str) -> Result<Self> {
        let paths = lock_paths(instance)?;
        let uid = operator_uid();
        let lock_owner_uid = operator_binding_owner_uid(&paths.owner_path, uid)?;
        let file = acquire_operation_lock(
            &paths.operation_lock_path,
            lock_owner_uid,
            uid,
            operation,
        )?;
        validate_operation_lock_owner(&file, &paths.owner_path, uid)?;
        let current = OperatorBinding {
            format_version: OPERATOR_BINDING_VERSION,
            uid,
            host_id: host_identity()?,
        };
        let binding = ensure_operator_binding(&paths.owner_path, &current)?;
        let recovery_path = paths.recovery_path(binding.uid, true)?;
        Ok(Self {
            _file: file,
            recovery_path,
            #[cfg(not(unix))]
            path: paths.operation_lock_path,
        })
    }

    pub fn recovery_path(&self) -> &Path {
        &self.recovery_path
    }

    pub(crate) fn file(&self) -> &File {
        &self._file
    }
    fn output_while_locked(&self, command: &mut Command) -> std::io::Result<Output> {
        output_while_inheriting_lock(&self._file, command)
    }

    fn clone_lock_file(&self) -> Result<File> {
        self._file
            .try_clone()
            .context("retaining the stack data lock for interruption recovery")
    }

}

pub(crate) fn spawn_with_inherited_lock(
    lock_file: &File,
    command: &mut Command,
) -> std::io::Result<std::process::Child> {
    #[cfg(unix)]
    unsafe {
        let fd = lock_file.as_raw_fd();
        command.pre_exec(move || {
            let flags = libc::fcntl(fd, libc::F_GETFD);
            if flags == -1 {
                return Err(std::io::Error::last_os_error());
            }
            if libc::fcntl(fd, libc::F_SETFD, flags & !libc::FD_CLOEXEC) == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    #[cfg(not(unix))]
    let _ = lock_file;
    command.spawn()
}

fn output_while_inheriting_lock(
    lock_file: &File,
    command: &mut Command,
) -> std::io::Result<Output> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    spawn_with_inherited_lock(lock_file, command)?.wait_with_output()
}


impl Drop for StackDataLock {
    fn drop(&mut self) {
        #[cfg(not(unix))]
        let _ = fs::remove_file(&self.path);
    }
}

pub fn acquire_stack_data_lock(instance: &Instance) -> Result<StackDataLock> {
    let lock = StackDataLock::acquire(instance, "stack data")?;
    cleanup_orphan_archive_helpers_locked(instance, &lock)?;
    recover_interrupted_operation(instance, &lock)?;
    Ok(lock)
}

pub fn acquire_stack_teardown_lock(instance: &Instance) -> Result<StackDataLock> {
    let lock = StackDataLock::acquire(instance, "stack teardown")?;
    cleanup_orphan_archive_helpers_locked(instance, &lock)?;
    Ok(lock)
}


pub fn clear_interrupted_operation(recovery_path: &Path) -> Result<()> {
    match fs::remove_file(recovery_path) {
        Ok(()) => sync_directory(recovery_path.parent().context("recovery path has no parent")?),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error).with_context(|| format!("removing {}", recovery_path.display())),
    }
}

pub fn finalize_interrupted_operation(instance: &Instance, recovery_path: &Path) -> Result<()> {
    if let Some(record) = read_recovery_record(recovery_path)? {
        if record.operation == InterruptedOperation::Migration {
            if let Some(source) = record.source_stack_state_path {
                let expected_suffix = Path::new("infra")
                    .join("local")
                    .join("generated")
                    .join(instance.name())
                    .join("stack.json");
                ensure!(
                    source.is_absolute() && source.ends_with(expected_suffix),
                    "migration recovery record contains an invalid source stack-state path"
                );
                match fs::remove_file(&source) {
                    Ok(()) => {
                        sync_directory(source.parent().context("source stack-state path has no parent")?)?;
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    Err(error) => {
                        return Err(error)
                            .with_context(|| format!("removing old stack state {}", source.display()));
                    }
                }
            }
        }
    }
    clear_interrupted_operation(recovery_path)
}
const ARCHIVE_HELPER_LABEL: &str = "com.macro.stack-data-helper";
const ARCHIVE_PROJECT_LABEL: &str = "com.macro.stack-data-project";

fn archive_helper_ids(instance: &Instance) -> Result<Vec<String>> {
    let filter = format!("label={ARCHIVE_PROJECT_LABEL}={}", instance.project_name());
    let output = Command::new("docker")
        .args([
            "ps",
            "--all",
            "--filter",
            &format!("label={ARCHIVE_HELPER_LABEL}=true"),
            "--filter",
            &filter,
            "--format",
            "{{.ID}}",
        ])
        .output()
        .context("finding interrupted Docker volume archive helpers")?;
    ensure!(output.status.success(), "could not list interrupted Docker volume archive helpers");
    let ids: Vec<String> = String::from_utf8(output.stdout)?
        .lines()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
        .collect();
    ensure!(
        ids.iter().all(|id| (12..=64).contains(&id.len()) && id.bytes().all(|byte| byte.is_ascii_hexdigit())),
        "Docker returned an invalid archive-helper container ID"
    );
    Ok(ids)
}


fn cleanup_orphan_archive_helpers_locked(
    instance: &Instance,
    lock: &StackDataLock,
) -> Result<()> {
    let filter = format!("label={ARCHIVE_PROJECT_LABEL}={}", instance.project_name());
    let ids = archive_helper_ids(instance)?;
    if ids.is_empty() {
        return Ok(());
    }
    let mut remove = Command::new("docker");
    remove.arg("rm").arg("--force").args(&ids);
    let output = output_while_inheriting_lock(&lock._file, &mut remove)
        .context("removing interrupted Docker volume archive helpers")?;
    ensure!(
        output.status.success(),
        "could not remove interrupted volume archive helpers; refusing to use or delete their mounted volumes"
    );
    let verify = Command::new("docker")
        .args([
            "ps",
            "--all",
            "--filter",
            &format!("label={ARCHIVE_HELPER_LABEL}=true"),
            "--filter",
            &filter,
            "--format",
            "{{.ID}}",
        ])
        .output()
        .context("confirming interrupted Docker volume archive helpers were removed")?;
    ensure!(verify.status.success(), "could not verify archive-helper cleanup");
    ensure!(
        String::from_utf8(verify.stdout)?.trim().is_empty(),
        "an interrupted Docker volume archive helper remains; refusing to access its volume"
    );
    Ok(())
}

fn write_recovery_record(
    path: &Path,
    operation: InterruptedOperation,
    containers: Vec<Container>,
    source_stack_state_path: Option<PathBuf>,
) -> Result<()> {
    let record = RecoveryRecord {
        operation,
        containers,
        source_stack_state_path,
    };
    let bytes = serde_json::to_vec(&record).context("serializing interrupted-operation recovery record")?;
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    set_private_file_mode(&mut options);
    let mut file = options
        .open(path)
        .with_context(|| format!("creating interrupted-operation record {}", path.display()))?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    sync_directory(path.parent().context("recovery path has no parent")?)
}

fn read_recovery_record(path: &Path) -> Result<Option<RecoveryRecord>> {
    match fs::symlink_metadata(path) {
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error).with_context(|| format!("checking {}", path.display())),
    }
    let mut file = open_regular_file(path)?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .context("reading interrupted-operation recovery record")?;
    let record: RecoveryRecord =
        serde_json::from_slice(&bytes).context("parsing interrupted-operation recovery record")?;
    for container in &record.containers {
        ensure!(
            (12..=64).contains(&container.id.len())
                && container.id.bytes().all(|byte| byte.is_ascii_hexdigit()),
            "recovery record contains an invalid Docker container ID"
        );
    }
    Ok(Some(record))
}

fn recover_interrupted_operation(instance: &Instance, lock: &StackDataLock) -> Result<()> {
    let path = lock.recovery_path();
    let Some(record) = read_recovery_record(path)? else {
        return Ok(());
    };
    match record.operation {
        InterruptedOperation::Backup => {
            resume_recorded_containers(&record.containers, &lock._file)?;
            clear_interrupted_operation(path)?;
            eprintln!("Recovered containers stopped by an interrupted portable backup.");
            Ok(())
        }
        InterruptedOperation::Migration => bail!(
            "a database migration was interrupted for instance '{}'; application writers were not restarted. Inspect the stack, then run `just stack down --instance {}` with the same --port-base if configured and restore its authenticated pre-migration backup",
            instance.name(),
            instance.name()
        ),
    }
}

fn resume_recorded_containers(containers: &[Container], lock_file: &File) -> Result<()> {
    let mut ordered = containers.to_vec();
    ordered.sort_by_key(|container| startup_rank(&container.service));
    for container in ordered {
        let (_, paused) = container_state(&container.id)
            .with_context(|| format!("recovering interrupted stack service {}", container.service))?;
        if paused {
            run_docker_locked(
                &["unpause", &container.id],
                "unpausing interrupted stack container",
                lock_file,
            )?;
        }
        let (state, paused) = container_state(&container.id)?;
        ensure!(!paused, "interrupted stack service '{}' remains paused", container.service);
        if state != "running" {
            run_docker_locked(
                &["start", &container.id],
                "restarting interrupted stack container",
                lock_file,
            )?;
        }
        ensure!(
            container_state(&container.id)?.0 == "running",
            "interrupted stack service '{}' did not return to running state",
            container.service
        );
    }
    Ok(())
}

struct BundleGuard {
    path: PathBuf,
    complete: bool,
}

impl Drop for BundleGuard {
    fn drop(&mut self) {
        if !self.complete {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}


struct ResumeGuard {
    containers: Vec<Container>,
    localstack_paused: Option<String>,
    recovery_path: PathBuf,
    lock_file: File,
    armed: bool,
}

impl ResumeGuard {
    fn new(containers: Vec<Container>, lock: &StackDataLock) -> Result<Self> {
        let recovery_path = lock.recovery_path().to_path_buf();
        let lock_file = lock.clone_lock_file()?;
        write_recovery_record(
            &recovery_path,
            InterruptedOperation::Backup,
            containers.clone(),
            None,
        )?;
        Ok(Self {
            containers,
            localstack_paused: None,
            recovery_path,
            lock_file,
            armed: true,
        })
    }

    fn pause_localstack(&mut self, id: &str) -> Result<()> {
        run_docker_locked(&["pause", id], "pausing LocalStack", &self.lock_file)?;
        self.localstack_paused = Some(id.to_owned());
        Ok(())
    }

    fn resume(&mut self) -> Result<()> {
        if let Some(id) = &self.localstack_paused {
            run_docker_locked(&["unpause", id], "resuming LocalStack", &self.lock_file)?;
            self.localstack_paused = None;
        }
        resume_recorded_containers(&self.containers, &self.lock_file)?;
        clear_interrupted_operation(&self.recovery_path)?;
        self.armed = false;
        Ok(())
    }
}

impl Drop for ResumeGuard {
    fn drop(&mut self) {
        if self.armed {
            let _ = self.resume();
        }
    }
}

fn startup_rank(service: &str) -> u8 {
    match service {
        "postgres" | "redis" | "search" | "kafka" | "localstack" => 0,
        "db" => 1,
        "fusionauth" => 2,
        _ => 3,
    }
}

pub fn backup(args: &BackupArgs) -> Result<()> {
    install_interrupt_handlers()?;
    let stage = Stage::from_env();
    let instance = Instance::derive(args.instance.instance.as_deref(), args.instance.port_base)?;
    let lock = acquire_stack_data_lock(&instance)?;
    let stage = stage.with_lock_file(lock.file())?;
    let revision = code_revision()?;
    let owner = running_project_working_dir(&instance)?
        .context("no running stack Compose owner was found")?;
    let current_checkout = fs::canonicalize(super::repo_root())
        .context("canonicalizing the current checkout for backup provenance")?;
    ensure!(
        owner == current_checkout,
        "portable backup must run from the checkout that owns the running Compose stack"
    );
    let state_path = owner
        .join("infra/local/generated")
        .join(instance.name())
        .join("stack.json");
    let state = read_stack_state(&state_path)?;
    ensure!(state.mode == "local", "only a headless local stack can be backed up");
    ensure!(state.git_tree_clean == Some(true), "stack was not started from a verified clean workspace build; use `stack update` from a clean checkout before backing it up");
    ensure!(state.git_revision.as_deref() == Some(revision.as_str()), "running stack code revision does not match this clean checkout; use `stack update` before backing it up");
    let containers = project_containers(&instance)?;
    validate_running_stack(&containers)?;
    validate_running_workspace_provenance(&state, &containers)?;
    let mcp_credentials_key_fingerprint = running_mcp_credentials_key_fingerprint(&instance)?;
    if let Some(recorded) = state.mcp_credentials_key_fingerprint.as_deref() {
        ensure!(
            recorded == mcp_credentials_key_fingerprint,
            "running MCP credentials encryption key differs from the key recorded for this stack"
        );
    }
    let auth_key_fingerprint = state
        .auth_key_fingerprint
        .context("stack has no recorded auth-key fingerprint")?;
    validate_source_volumes(&instance, &containers)?;
    let image_ids = stateful_image_ids(&containers)?;
    let out = prepare_bundle_dir(&args.output)?;
    let mut bundle = BundleGuard {
        path: out.clone(),
        complete: false,
    };
    let mut resume = ResumeGuard::new(containers.clone(), &lock)?;

    stage.section(&format!("stack data backup — instance {}", instance.name()));
    let writers: Vec<_> = containers
        .iter()
        .filter(|container| !STATEFUL_SERVICES.contains(&container.service.as_str()))
        .map(|container| container.id.clone())
        .collect();
    stop_containers(&writers, "quiescing application writers", &lock)?;

    let localstack = containers
        .iter()
        .find(|container| container.service == "localstack")
        .context("stack has no LocalStack container")?;
    resume.pause_localstack(&localstack.id)?;

    let infra: Vec<_> = containers
        .iter()
        .filter(|container| matches!(container.service.as_str(), "fusionauth" | "db" | "postgres" | "redis" | "search" | "kafka"))
        .map(|container| container.id.clone())
        .collect();
    stop_containers(&infra, "stopping stateful services for a consistent archive", &lock)?;

    let pairs = volumes(&instance);
    let mut records = Vec::with_capacity(pairs.len());
    for (name, volume) in pairs {
        check_interrupted()?;
        stage.run_step(&format!("Archiving volume {volume}"), || {
            archive_volume(&instance, &volume, &out, name, lock.file())
        })?;
        let path = out.join(name);
        set_private_file_mode_path(&path)?;
        File::open(&path)?.sync_all()?;
        let (sha256, bytes) = hash_file(&path)?;
        records.push(ArchiveRecord {
            name: name.to_owned(),
            sha256,
            bytes,
        });
    }
    ensure!(
        code_revision()? == revision && working_tree_is_clean()?,
        "repository changed during backup; the incomplete bundle will be removed"
    );

    let manifest = Manifest {
        format: FORMAT,
        created_unix: SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs(),
        source_instance: instance.name().to_owned(),
        source_port_map: port_map(&instance),
        code_revision: revision,
        source_tree_clean: true,
        app_version: app_version()?,
        migration_sha256: migration_fingerprint()?,
        docker_platform: docker_platform()?,
        auth_key_fingerprint,
        mcp_credentials_key_fingerprint,
        stateful_image_ids: image_ids,
        archives: records,
    };
    write_manifest(&out, &manifest)?;
    sync_directory(&out)?;
    bundle.complete = true;
    resume.resume()?;
    let (manifest_sha256, _) = hash_file(&out.join("manifest.json"))?;
    println!("Created data archive for instance '{}' at {}", instance.name(), out.display());
    println!("Trusted manifest SHA-256 (transfer separately): {manifest_sha256}");
    println!("The bundle contains sensitive database, object-store, KMS, and identity state; protect it as plaintext backup data.");
    Ok(())
}

pub fn validate_restore_bundle(
    path: &Path,
    target: &Instance,
    trusted_manifest_sha256: &str,
) -> Result<ValidatedBundle> {
    install_interrupt_handlers()?;
    ensure!(working_tree_is_clean()?, "restore requires a clean checkout so its schema/version identity is exact");
    ensure!(
        trusted_manifest_sha256.len() == 64
            && trusted_manifest_sha256.bytes().all(|byte| byte.is_ascii_hexdigit()),
        "--trusted-manifest-sha256 must be a 64-character SHA-256 digest obtained out of band"
    );
    let dir = fs::canonicalize(path).with_context(|| format!("opening backup bundle {}", path.display()))?;
    ensure!(dir.is_dir(), "backup bundle path is not a directory");
    ensure!(dir.to_string_lossy().find(',').is_none(), "backup path must not contain commas (Docker bind-mount syntax)");
    let manifest_path = dir.join("manifest.json");
    let mut manifest_file = open_regular_file(&manifest_path)?;
    let mut manifest_bytes = Vec::new();
    manifest_file.read_to_end(&mut manifest_bytes).context("reading backup manifest")?;
    let actual_manifest_sha256 = hex(&Sha256::digest(&manifest_bytes));
    ensure!(
        actual_manifest_sha256.eq_ignore_ascii_case(trusted_manifest_sha256),
        "backup manifest digest does not match --trusted-manifest-sha256"
    );
    let manifest: Manifest = serde_json::from_slice(&manifest_bytes).context("parsing backup manifest")?;
    ensure!(manifest.format == FORMAT, "unsupported data-backup format");
    ensure!(manifest.source_tree_clean, "backup was created from a dirty checkout");
    ensure!(manifest.code_revision == code_revision()?, "backup code revision does not match this checkout");
    ensure!(manifest.app_version == app_version()?, "backup application version does not match this checkout");
    ensure!(manifest.migration_sha256 == migration_fingerprint()?, "backup database schema does not match this checkout");
    ensure!(manifest.docker_platform == docker_platform()?, "backup Docker platform differs from this target");
    ensure!(manifest.source_port_map == port_map(target), "target host ports differ from the source; use the same --port-base on the target node");
    let staged_dir = create_restore_bundle_dir()?;
    let mut guard = BundleGuard {
        path: staged_dir.clone(),
        complete: false,
    };
    stage_verified_archives(&dir, &staged_dir, &manifest)?;
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    set_private_file_mode(&mut options);
    let mut staged_manifest = options
        .open(staged_dir.join("manifest.json"))
        .context("staging trusted backup manifest")?;
    staged_manifest.write_all(&manifest_bytes)?;
    staged_manifest.sync_all()?;
    sync_directory(&staged_dir)?;
    guard.complete = true;
    Ok(ValidatedBundle {
        path: staged_dir,
        manifest,
    })
}


pub fn validate_pre_migration_backup(
    path: &Path,
    target: &Instance,
    trusted_manifest_sha256: &str,
    expected_source_revision: &str,
) -> Result<ValidatedBundle> {
    ensure!(
        trusted_manifest_sha256.len() == 64
            && trusted_manifest_sha256.bytes().all(|byte| byte.is_ascii_hexdigit()),
        "--trusted-manifest-sha256 must be a 64-character SHA-256 digest obtained out of band"
    );
    let dir = fs::canonicalize(path).with_context(|| format!("opening pre-migration backup {}", path.display()))?;
    ensure!(dir.is_dir(), "pre-migration backup path is not a directory");
    ensure!(dir.to_string_lossy().find(',').is_none(), "backup path must not contain commas (Docker bind-mount syntax)");
    let mut file = open_regular_file(&dir.join("manifest.json"))?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).context("reading pre-migration manifest")?;
    ensure!(
        hex(&Sha256::digest(&bytes)).eq_ignore_ascii_case(trusted_manifest_sha256),
        "pre-migration backup manifest digest does not match --trusted-manifest-sha256"
    );
    let manifest: Manifest = serde_json::from_slice(&bytes).context("parsing pre-migration manifest")?;
    ensure!(manifest.format == FORMAT, "unsupported data-backup format");
    ensure!(manifest.source_tree_clean, "pre-migration backup was created from a dirty checkout");
    ensure!(
        manifest.code_revision == expected_source_revision,
        "pre-migration backup does not match the running stack revision"
    );
    ensure!(manifest.source_port_map == port_map(target), "pre-migration backup host-port map differs from the running instance");
    ensure!(manifest.docker_platform == docker_platform()?, "pre-migration backup Docker platform differs from this host");
    let staged_dir = create_restore_bundle_dir()?;
    let mut guard = BundleGuard {
        path: staged_dir.clone(),
        complete: false,
    };
    stage_verified_archives(&dir, &staged_dir, &manifest)?;
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    set_private_file_mode(&mut options);
    let mut staged_manifest = options
        .open(staged_dir.join("manifest.json"))
        .context("staging pre-migration manifest")?;
    staged_manifest.write_all(&bytes)?;
    staged_manifest.sync_all()?;
    sync_directory(&staged_dir)?;
    guard.complete = true;
    Ok(ValidatedBundle {
        path: staged_dir,
        manifest,
    })
}
fn path_entry_exists(path: &Path) -> Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error).with_context(|| format!("checking {}", path.display())),
    }
}

pub fn validate_empty_target(instance: &Instance) -> Result<()> {
    let containers = project_containers(instance)?;
    ensure!(containers.is_empty(), "restore target already has Docker containers; refusing to overwrite it");
    let names: Vec<_> = volumes(instance).into_iter().map(|(_, name)| name).collect();
    for name in names {
        ensure!(!docker_volume_exists(&name)?, "restore target volume '{name}' already exists; refusing to overwrite it");
    }
    let state_path = instance.artifact_dir().join("stack.json");
    ensure!(!path_entry_exists(&state_path)?, "restore target has existing stack state; refusing to overwrite it");
    let busy = instance.busy_ports();
    ensure!(busy.is_empty(), "restore target ports are already in use; refusing to start into a possibly active instance");
    Ok(())
}

pub fn validate_restore_identity(
    bundle: &ValidatedBundle,
    target: &Instance,
    auth_key_fingerprint: &str,
    mcp_credentials_key_fingerprint: &str,
) -> Result<()> {
    ensure!(bundle.manifest.auth_key_fingerprint == auth_key_fingerprint, "target FusionAuth/auth key does not match the source backup");
    ensure!(
        bundle.manifest.mcp_credentials_key_fingerprint == mcp_credentials_key_fingerprint,
        "target MCP credentials encryption key does not match the source backup"
    );
    ensure!(bundle.manifest.source_port_map == port_map(target), "target host ports differ from the source backup");
    Ok(())
}

pub fn ensure_compatible_images(
    stage: &Stage,
    instance: &Instance,
    env: &super::env_layer::ResolvedEnv,
    bundle: &ValidatedBundle,
) -> Result<()> {
    let mut pull = super::compose_cmd(instance, env);
    pull.args(["pull", "postgres", "redis", "kafka", "localstack", "db", "fusionauth"]);
    stage.run("Pulling stateful service images for restore compatibility", &mut pull)?;

    let mut build = super::compose_cmd(instance, env);
    build.args(["build", "search"]);
    stage.run("Building the target OpenSearch image", &mut build)?;

    let mut config = super::compose_cmd(instance, env);
    config.args(["config", "--format", "json"]);
    let output = config.output().context("resolving target compose image configuration")?;
    ensure!(output.status.success(), "could not resolve target compose images");
    let config: serde_json::Value = serde_json::from_slice(&output.stdout).context("parsing target compose configuration")?;
    let services = config
        .get("services")
        .and_then(serde_json::Value::as_object)
        .context("target compose configuration has no services")?;
    let mut actual = BTreeMap::new();
    for service in STATEFUL_SERVICES {
        let image = services
            .get(service)
            .and_then(|service| service.get("image"))
            .and_then(serde_json::Value::as_str)
            .with_context(|| format!("target compose has no image for {service}"))?;
        let output = Command::new("docker")
            .args(["image", "inspect", "--format", "{{.Id}}", image])
            .output()
            .with_context(|| format!("inspecting target image for {service}"))?;
        ensure!(output.status.success(), "target image for {service} is not available locally");
        let id = String::from_utf8(output.stdout)?.trim().to_owned();
        ensure!(!id.is_empty(), "target image for {service} has no immutable ID");
        actual.insert(service.to_owned(), id);
    }
    ensure!(actual == bundle.manifest.stateful_image_ids, "stateful Docker image IDs differ from the source backup");
    Ok(())
}

const RESTORE_VOLUME_LABEL: &str = "com.macro.stack-restore-operation";

pub fn create_restore_volumes(instance: &Instance, lock_file: &File) -> Result<String> {
    validate_empty_target(instance)?;
    let mut random = [0u8; 32];
    File::open("/dev/urandom")
        .context("opening the system random source for restore volume ownership")?
        .read_exact(&mut random)
        .context("generating restore volume ownership token")?;
    let token = hex(&random);
    for (_, volume) in volumes(instance) {
        ensure!(
            !docker_volume_exists(&volume)?,
            "restore target volume '{volume}' appeared before exclusive creation; refusing to use or remove it"
        );
        let label = format!("{RESTORE_VOLUME_LABEL}={token}");
        let mut create = Command::new("docker");
        create.args(["volume", "create", "--label", &label, &volume]);
        let output = output_while_inheriting_lock(lock_file, &mut create)
            .with_context(|| format!("creating restore target volume '{volume}'"))?;
        ensure!(output.status.success(), "could not create restore target volume '{volume}'");
        ensure!(
            docker_volume_label(&volume, RESTORE_VOLUME_LABEL)?.as_deref() == Some(token.as_str()),
            "restore target volume '{volume}' was created concurrently; refusing to use or remove it"
        );
    }
    Ok(token)
}

pub fn validate_restore_claim(instance: &Instance, token: &str) -> Result<()> {
    ensure!(
        project_containers(instance)?.is_empty(),
        "restore target acquired Docker containers during preparation; refusing to use or remove them"
    );
    ensure!(
        !path_entry_exists(&instance.artifact_dir().join("stack.json"))?,
        "restore target acquired stack state during preparation; refusing to overwrite it"
    );
    for (_, volume) in volumes(instance) {
        ensure!(
            docker_volume_label(&volume, RESTORE_VOLUME_LABEL)?.as_deref() == Some(token),
            "restore target volume '{volume}' is not exclusively owned by this restore; refusing to use or remove it"
        );
    }
    Ok(())
}

pub fn restore_volumes(
    stage: &Stage,
    instance: &Instance,
    bundle: &ValidatedBundle,
    token: &str,
    lock_file: &File,
) -> Result<()> {
    validate_restore_claim(instance, token)?;
    let pairs = volumes(instance);
    for (_, volume) in &pairs {
        ensure!(docker_volume_exists(volume)?, "restore target volume '{volume}' disappeared");
        ensure!(
            docker_volume_label(volume, RESTORE_VOLUME_LABEL)?.as_deref() == Some(token),
            "restore target volume '{volume}' changed ownership; refusing to write it"
        );
    }
    validate_restore_claim(instance, token)?;
    check_interrupted()?;
    for (name, volume) in pairs {
        check_interrupted()?;
        ensure!(
            docker_volume_label(&volume, RESTORE_VOLUME_LABEL)?.as_deref() == Some(token),
            "restore target volume '{volume}' changed ownership; refusing to write it"
        );
        stage.run_step(&format!("Restoring volume {volume}"), || {
            extract_volume(instance, &volume, &bundle.path, name, token, lock_file)
        })?;
    }
    validate_restore_claim(instance, token)?;
    check_interrupted()?;
    Ok(())
}

fn read_stack_state(path: &Path) -> Result<RunningStackState> {
    let bytes = fs::read(path).with_context(|| format!("reading {}", path.display()))?;
    serde_json::from_slice(&bytes).context("parsing stack state")
}

fn validate_running_workspace_provenance(
    state: &RunningStackState,
    containers: &[Container],
) -> Result<()> {
    let recorded = state
        .binaries_dir
        .as_deref()
        .context("running stack has no recorded binary directory")?;
    let target = super::arch::detect()?;
    let expected = fs::canonicalize(super::workspace_root().join(target.debug_dir()))
        .context("opening this checkout's workspace binary directory")?;
    let recorded = fs::canonicalize(recorded)
        .context("opening the binary directory recorded for the running stack")?;
    ensure!(
        recorded == expected,
        "portable backup requires binaries built in the running stack's owning checkout"
    );
    let container = containers
        .iter()
        .find(|container| container.service == "authentication-service")
        .context("running stack has no authentication-service container")?;
    let output = Command::new("docker")
        .args(["inspect", "--format", "{{json .Mounts}}", &container.id])
        .output()
        .context("inspecting the running stack's binary mount")?;
    ensure!(output.status.success(), "could not inspect the running stack's binary mount");
    let mounts: Vec<serde_json::Value> =
        serde_json::from_slice(&output.stdout).context("parsing the running stack's mounts")?;
    let mounted = mounts
        .iter()
        .find(|mount| {
            mount.get("Type").and_then(serde_json::Value::as_str) == Some("bind")
                && mount.get("Destination").and_then(serde_json::Value::as_str)
                    == Some("/app/out")
        })
        .and_then(|mount| mount.get("Source"))
        .and_then(serde_json::Value::as_str)
        .context("authentication service does not mount a host binary directory at /app/out")?;
    ensure!(
        fs::canonicalize(mounted).context("opening the mounted binary directory")? == recorded,
        "running authentication-service binary mount differs from its recorded workspace directory"
    );
    Ok(())
}

#[derive(Deserialize)]
struct RunningStackState {
    mode: String,
    auth_key_fingerprint: Option<String>,

    #[serde(default)]
    binaries_dir: Option<PathBuf>,

    #[serde(default)]
    mcp_credentials_key_fingerprint: Option<String>,
    #[serde(default)]
    git_revision: Option<String>,
    #[serde(default)]
    git_tree_clean: Option<bool>,
}

pub fn running_project_working_dir(instance: &Instance) -> Result<Option<PathBuf>> {
    let containers = project_containers(instance)?;
    if containers.is_empty() {
        return Ok(None);
    }
    // `stack update` remounts only Rust services. During a cross-checkout
    // migration, older infrastructure containers can still carry the previous
    // Compose working-directory label; the authentication service is always a
    // member of both Local and Dev stacks and is recreated by every remount.
    let container = containers
        .iter()
        .find(|container| container.service == "authentication-service")
        .context("running stack has no authentication-service container for checkout attribution")?;
    let output = Command::new("docker")
        .args([
            "inspect",
            "--format",
            "{{index .Config.Labels \"com.docker.compose.project.working_dir\"}}",
            &container.id,
        ])
        .output()
        .context("identifying the checkout that owns the running stack")?;
    ensure!(output.status.success(), "could not inspect the running stack's Compose working directory");
    let working_dir = String::from_utf8(output.stdout)?.trim().to_owned();
    ensure!(!working_dir.is_empty(), "running stack has no Compose working-directory label");
    let working_dir = PathBuf::from(working_dir);
    ensure!(working_dir.is_absolute(), "running stack has a non-absolute Compose working directory");
    let working_dir = fs::canonicalize(&working_dir)
        .with_context(|| format!("opening running stack checkout {}", working_dir.display()))?;
    ensure!(working_dir.is_dir(), "running stack Compose working directory is not a directory");
    Ok(Some(working_dir))
}

fn project_containers(instance: &Instance) -> Result<Vec<Container>> {
    let filter = format!("label=com.docker.compose.project={}", instance.project_name());
    let output = Command::new("docker")
        .args([
            "ps",
            "--all",
            "--filter",
            &filter,
            "--format",
            "{{.ID}}|{{.State}}|{{.Label \"com.docker.compose.service\"}}",
        ])
        .output()
        .context("listing instance containers")?;
    ensure!(output.status.success(), "could not list Docker containers");
    let text = String::from_utf8(output.stdout).context("Docker container list was not UTF-8")?;
    text.lines()
        .filter(|line| !line.is_empty())
        .map(|line| {
            let mut fields = line.split('|');
            let id = fields.next().unwrap_or_default();
            let state = fields.next().unwrap_or_default();
            let service = fields.next().unwrap_or_default();
            ensure!(!id.is_empty() && !state.is_empty() && !service.is_empty(), "Docker returned an incomplete container row");
            Ok(Container {
                id: id.to_owned(),
                service: service.to_owned(),
                state: state.to_owned(),
            })
        })
        .collect()
}

fn validate_running_stack(containers: &[Container]) -> Result<()> {
    ensure!(!containers.is_empty(), "no running stack containers found");
    ensure!(containers.iter().all(|container| container.state == "running"), "stack has stopped containers; backup requires the entire instance to be running");
    for service in STATEFUL_SERVICES {
        ensure!(containers.iter().filter(|container| container.service == service).count() == 1, "expected exactly one running '{service}' container");
    }
    Ok(())
}

pub fn stop_application_writers(
    instance: &Instance,
    lock: &StackDataLock,
    source_stack_state_path: Option<&Path>,
) -> Result<()> {
    let containers = project_containers(instance)?;
    validate_running_stack(&containers)?;
    let writers: Vec<String> = containers
        .iter()
        .filter(|container| !STATEFUL_SERVICES.contains(&container.service.as_str()))
        .map(|container| container.id.clone())
        .collect();
    write_recovery_record(
        lock.recovery_path(),
        InterruptedOperation::Migration,
        containers.clone(),
        source_stack_state_path.map(Path::to_path_buf),
    )?;
    if let Err(error) = stop_containers(
        &writers,
        "quiescing application writers for database migration",
        lock,
    ) {
        if resume_recorded_containers(&containers, &lock._file).is_ok() {
            clear_interrupted_operation(lock.recovery_path())?;
            return Err(error);
        }
        return Err(error).context("application writers could not be restored; migration recovery record was retained");
    }
    Ok(())
}

pub fn stop_running_application_writers(instance: &Instance, lock: &StackDataLock) -> Result<()> {
    let containers = project_containers(instance)?;
    let writers: Vec<String> = containers
        .iter()
        .filter(|container| {
            container.state == "running"
                && !STATEFUL_SERVICES.contains(&container.service.as_str())
        })
        .map(|container| container.id.clone())
        .collect();
    stop_containers(
        &writers,
        "stopping application writers after migration failure",
        lock,
    )
}

fn validate_source_volumes(instance: &Instance, containers: &[Container]) -> Result<()> {
    for (service, expected_volume, destination) in expected_volume_mounts(instance) {
        ensure!(
            docker_volume_exists(&expected_volume)?,
            "stateful volume '{expected_volume}' is missing; refusing to archive container-layer data"
        );
        let container = containers
            .iter()
            .find(|container| container.service == service)
            .with_context(|| format!("missing stateful container '{service}'"))?;
        let output = Command::new("docker")
            .args(["inspect", "--format", "{{json .Mounts}}", &container.id])
            .output()
            .with_context(|| format!("inspecting {service} volume mounts"))?;
        ensure!(output.status.success(), "could not inspect {service} volume mounts");
        let mounts: Vec<serde_json::Value> = serde_json::from_slice(&output.stdout)
            .with_context(|| format!("parsing {service} volume mounts"))?;
        ensure!(
            mounts.iter().any(|mount| {
                mount.get("Type").and_then(serde_json::Value::as_str) == Some("volume")
                    && mount.get("Name").and_then(serde_json::Value::as_str)
                        == Some(expected_volume.as_str())
                    && mount.get("Destination").and_then(serde_json::Value::as_str)
                        == Some(destination)
            }),
            "stateful service '{service}' does not mount expected volume '{expected_volume}' at {destination}; refusing an incomplete backup"
        );
    }
    let localstack = containers
        .iter()
        .find(|container| container.service == "localstack")
        .context("stack has no LocalStack container")?;
    let localstack_env = container_environment(localstack)?;
    for required in [
        "PERSISTENCE=1",
        "SNAPSHOT_SAVE_STRATEGY=ON_REQUEST",
        "SNAPSHOT_LOAD_STRATEGY=ON_STARTUP",
    ] {
        ensure!(
            localstack_env.iter().any(|entry| entry == required),
            "running LocalStack lacks {required}; refusing to archive potentially in-container state"
        );
    }
    Ok(())
}

fn stateful_image_ids(containers: &[Container]) -> Result<BTreeMap<String, String>> {
    let mut images = BTreeMap::new();
    for service in STATEFUL_SERVICES {
        let container = containers.iter().find(|container| container.service == service).context("missing stateful service container")?;
        let output = Command::new("docker")
            .args(["inspect", "--format", "{{.Image}}", &container.id])
            .output()
            .with_context(|| format!("inspecting {service} image"))?;
        ensure!(output.status.success(), "could not inspect {service} image");
        let id = String::from_utf8(output.stdout)?.trim().to_owned();
        ensure!(!id.is_empty(), "{service} container has no immutable image ID");
        images.insert(service.to_owned(), id);
    }
    Ok(images)
}

fn stop_containers(ids: &[String], context: &str, lock: &StackDataLock) -> Result<()> {
    if ids.is_empty() {
        return Ok(());
    }
    let mut command = Command::new("docker");
    command.args(["stop", "--time", "60"]);
    command.args(ids);
    let output = lock
        .output_while_locked(&mut command)
        .with_context(|| format!("{context}"))?;
    ensure!(output.status.success(), "{context} failed; the source stack will be restarted where possible");
    Ok(())
}


fn container_state(id: &str) -> Result<(&'static str, bool)> {
    let output = Command::new("docker")
        .args(["inspect", "--format", "{{.State.Status}}|{{.State.Paused}}", id])
        .output()
        .context("inspecting container state")?;
    ensure!(output.status.success(), "could not inspect container state");
    let text = String::from_utf8(output.stdout)?;
    let (state, paused) = text.trim().split_once('|').context("Docker returned an invalid container state")?;
    let state = match state {
        "running" => "running",
        "created" => "created",
        "restarting" => "restarting",
        "exited" => "exited",
        "paused" => "paused",
        _ => "other",
    };
    Ok((state, paused == "true"))
}

fn run_docker_locked(args: &[&str], context: &str, lock_file: &File) -> Result<()> {
    let mut command = Command::new("docker");
    command.args(args);
    let output = output_while_inheriting_lock(lock_file, &mut command)
        .with_context(|| context.to_owned())?;
    ensure!(output.status.success(), "{context} failed");
    Ok(())
}

fn prepare_bundle_dir(path: &Path) -> Result<PathBuf> {
    let parent = path.parent().filter(|parent| !parent.as_os_str().is_empty()).unwrap_or(Path::new("."));
    fs::create_dir_all(parent).with_context(|| format!("creating backup parent {}", parent.display()))?;
    let name = path.file_name().context("backup output must name a new directory")?;
    let destination = fs::canonicalize(parent)?.join(name);
    ensure!(destination.to_string_lossy().find(',').is_none(), "backup path must not contain commas (Docker bind-mount syntax)");
    fs::create_dir(&destination).with_context(|| format!("creating new backup directory {}", destination.display()))?;
    if let Err(error) = set_private_dir_mode(&destination) {
        let _ = fs::remove_dir_all(&destination);
        return Err(error);
    }
    Ok(destination)
}

#[cfg(unix)]
fn host_user_ids() -> (u32, u32) {
    unsafe { (libc::getuid() as u32, libc::getgid() as u32) }
}

#[cfg(not(unix))]
fn host_user_ids() -> (u32, u32) {
    (0, 0)
}

fn archive_volume(
    instance: &Instance,
    volume: &str,
    output_dir: &Path,
    name: &str,
    lock_file: &File,
) -> Result<()> {
    let (uid, gid) = host_user_ids();
    run_helper(
        instance,
        volume,
        output_dir,
        &format!(
            "tar --version | grep -q 'GNU tar' && tar --one-file-system --sort=name --format=pax --acls --xattrs --numeric-owner --sparse -czf /bundle/{name} -C /vol . && chown {uid}:{gid} /bundle/{name} && chmod 600 /bundle/{name}"
        ),
        "archiving a Docker volume",
        false,
        lock_file,
    )
}

fn ensure_volume_unmounted(volume: &str) -> Result<()> {
    let filter = format!("volume={volume}");
    let output = Command::new("docker")
        .args([
            "ps",
            "--all",
            "--filter",
            &filter,
            "--format",
            "{{.ID}}",
        ])
        .output()
        .context("checking whether a restore target volume is already mounted")?;
    ensure!(output.status.success(), "could not inspect Docker volume users");
    ensure!(
        String::from_utf8(output.stdout)?.trim().is_empty(),
        "restore target volume '{volume}' is mounted by another container; refusing to extract"
    );
    Ok(())
}

fn extract_volume(
    instance: &Instance,
    volume: &str,
    bundle_dir: &Path,
    name: &str,
    token: &str,
    lock_file: &File,
) -> Result<()> {
    ensure_volume_unmounted(volume)?;
    let lock = format!("/vol/.macro-stack-restore-{token}");
    let script = format!(
        "lock='{lock}'; \
         mkdir \"$lock\" || {{ echo 'another restore helper owns this target volume' >&2; exit 73; }}; \
         trap 'rmdir \"$lock\"' EXIT; \
         if [ -n \"$(find /vol -mindepth 1 ! -path \"$lock\" ! -path \"$lock/*\" -print -quit)\" ]; then \
           echo 'restore target volume is not empty' >&2; exit 74; \
         fi; \
         tar --version | grep -q 'GNU tar' && \
         tar --one-file-system --numeric-owner --same-owner --same-permissions --acls --xattrs --delay-directory-restore -xzf /bundle/{name} -C /vol"
    );
    run_helper(
        instance,
        volume,
        bundle_dir,
        &script,
        "restoring a Docker volume",
        true,
        lock_file,
    )
}

fn run_helper(
    instance: &Instance,
    volume: &str,
    bundle_dir: &Path,
    script: &str,
    context: &str,
    bundle_read_only: bool,
    lock_file: &File,
) -> Result<()> {
    let output = helper_output(instance, volume, bundle_dir, script, bundle_read_only, lock_file)?;
    ensure!(
        output.status.success(),
        "{context} failed for volume '{volume}': {}",
        String::from_utf8_lossy(&output.stderr)
    );
    Ok(())
}

fn helper_output(
    instance: &Instance,
    volume: &str,
    bundle_dir: &Path,
    script: &str,
    bundle_read_only: bool,
    lock_file: &File,
) -> Result<Output> {
    let volume_mount = format!("type=volume,source={volume},target=/vol");
    let bundle_mount = if bundle_read_only {
        format!("type=bind,source={},target=/bundle,readonly", bundle_dir.display())
    } else {
        format!("type=bind,source={},target=/bundle", bundle_dir.display())
    };
    let helper_label = format!("{ARCHIVE_HELPER_LABEL}=true");
    let project_label = format!("{ARCHIVE_PROJECT_LABEL}={}", instance.project_name());
    let mut command = Command::new("docker");
    command.args([
        "run",
        "--rm",
        "--network",
        "none",
        "--label",
        &helper_label,
        "--label",
        &project_label,
        "--mount",
        &volume_mount,
        "--mount",
        &bundle_mount,
        ARCHIVE_HELPER_IMAGE,
        "sh",
        "-ceu",
        script,
    ]);
    output_while_inheriting_lock(lock_file, &mut command)
        .context("running the volume archive helper")
}

fn write_manifest(dir: &Path, manifest: &Manifest) -> Result<()> {
    let content = serde_json::to_vec_pretty(manifest).context("serializing backup manifest")?;
    let path = dir.join("manifest.json");
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    set_private_file_mode(&mut options);
    let mut file = options.open(&path).context("creating backup manifest")?;
    file.write_all(&content)?;
    file.sync_all()?;
    Ok(())
}

fn create_restore_bundle_dir() -> Result<PathBuf> {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
    let path = std::env::temp_dir().join(format!(
        "macro-restore-{}-{nonce}",
        std::process::id()
    ));
    ensure!(
        path.to_string_lossy().find(',').is_none(),
        "temporary directory path must not contain commas (Docker bind-mount syntax)"
    );
    fs::create_dir(&path).with_context(|| format!("creating private restore staging directory {}", path.display()))?;
    if let Err(error) = set_private_dir_mode(&path) {
        let _ = fs::remove_dir_all(&path);
        return Err(error);
    }
    Ok(path)
}

fn open_regular_file(path: &Path) -> Result<File> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let file = options
        .open(path)
        .with_context(|| format!("opening {}", path.display()))?;
    ensure!(
        file.metadata()?.is_file(),
        "{} is not a regular file",
        path.display()
    );
    Ok(file)
}

fn stage_verified_archives(source: &Path, destination: &Path, manifest: &Manifest) -> Result<()> {
    let expected: BTreeSet<String> = volumes(&Instance::derive(None, None)?)
        .into_iter()
        .map(|(name, _)| name.to_owned())
        .collect();
    let actual: BTreeSet<String> = manifest
        .archives
        .iter()
        .map(|archive| archive.name.clone())
        .collect();
    ensure!(actual.len() == manifest.archives.len(), "backup manifest contains duplicate archive names");
    ensure!(actual == expected, "backup manifest does not contain the complete required volume set");
    for record in &manifest.archives {
        let mut input = open_regular_file(&source.join(&record.name))?;
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        set_private_file_mode(&mut options);
        let mut output = options
            .open(destination.join(&record.name))
            .with_context(|| format!("creating staged archive {}", record.name))?;
        let mut hash = Sha256::new();
        let mut bytes = 0u64;
        let mut buffer = [0u8; 64 * 1024];
        loop {
            let count = input.read(&mut buffer)?;
            if count == 0 {
                break;
            }
            output.write_all(&buffer[..count])?;
            hash.update(&buffer[..count]);
            bytes = bytes
                .checked_add(count as u64)
                .context("archive size overflow while staging")?;
        }
        output.sync_all()?;
        ensure!(
            bytes == record.bytes && hex(&hash.finalize()) == record.sha256,
            "archive integrity check failed for {}",
            record.name
        );
    }
    Ok(())
}

fn docker_volume_exists(name: &str) -> Result<bool> {
    let output = Command::new("docker")
        .args(["volume", "inspect", name])
        .output()
        .context("inspecting Docker volume")?;
    if output.status.success() {
        return Ok(true);
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    if stderr.contains("no such volume") || stderr.contains("No such volume") {
        return Ok(false);
    }
    bail!("could not establish whether target volume '{name}' exists");
}


pub fn remove_volume_and_confirm_absent(name: &str, stage: &Stage) -> Result<()> {
    if docker_volume_exists(name)? {
        let mut remove = Command::new("docker");
        remove.args(["volume", "rm", "--force", name]);
        let output = stage
            .output(&mut remove)
            .with_context(|| format!("removing Docker volume '{name}'"))?;
        ensure!(
            output.status.success(),
            "could not remove Docker volume '{name}': {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    ensure!(
        !docker_volume_exists(name)?,
        "Docker volume '{name}' still exists after removal; refusing to recreate or reuse it"
    );
    Ok(())
}
fn docker_volume_label(name: &str, label: &str) -> Result<Option<String>> {
    let output = Command::new("docker")
        .args(["volume", "inspect", "--format", "{{json .Labels}}", name])
        .output()
        .with_context(|| format!("inspecting labels for Docker volume '{name}'"))?;
    ensure!(output.status.success(), "could not inspect Docker volume '{name}' labels");
    let labels: serde_json::Value = serde_json::from_slice(&output.stdout)
        .with_context(|| format!("parsing Docker volume '{name}' labels"))?;
    Ok(labels
        .get(label)
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned))
}

fn check_interrupted() -> Result<()> {
    ensure!(!INTERRUPTED.load(Ordering::SeqCst), "operation interrupted; incomplete output was removed where possible");
    Ok(())
}

static INTERRUPTED: AtomicBool = AtomicBool::new(false);

extern "C" fn interrupt_handler(_: libc::c_int) {
    INTERRUPTED.store(true, Ordering::SeqCst);
}

fn install_interrupt_handlers() -> Result<()> {
    INTERRUPTED.store(false, Ordering::SeqCst);
    // A caught interrupt lets the operation unwind through its cleanup guards;
    // child Docker helpers still receive the terminal signal and return failure.
    unsafe {
        let mut action: libc::sigaction = std::mem::zeroed();
        action.sa_sigaction = interrupt_handler as usize;
        action.sa_flags = 0;
        libc::sigemptyset(&mut action.sa_mask);
        ensure!(libc::sigaction(libc::SIGINT, &action, std::ptr::null_mut()) == 0, "could not install interrupt cleanup handler");
        ensure!(libc::sigaction(libc::SIGTERM, &action, std::ptr::null_mut()) == 0, "could not install termination cleanup handler");
    }
    Ok(())
}

fn sync_directory(path: &Path) -> Result<()> {
    File::open(path)?.sync_all().context("syncing backup directory")
}

#[cfg(unix)]
fn set_private_dir_mode(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    Ok(())
}

#[cfg(not(unix))]
fn set_private_dir_mode(_path: &Path) -> Result<()> {
    Ok(())
}

#[cfg(unix)]
fn set_private_file_mode(options: &mut OpenOptions) {
    use std::os::unix::fs::OpenOptionsExt;
    options.mode(0o600);
}

#[cfg(not(unix))]
fn set_private_file_mode(_options: &mut OpenOptions) {}

#[cfg(unix)]
fn set_private_file_mode_path(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    Ok(())
}

#[cfg(not(unix))]
fn set_private_file_mode_path(_path: &Path) -> Result<()> {
    Ok(())
}
#[cfg(test)]
mod operator_binding_tests {
    use super::{
        OPERATOR_BINDING_VERSION, OperatorBinding, OperatorHandoffArgs, acquire_operation_lock,
        ensure_operator_binding, handoff_operator, open_operation_lock_file, operator_uid,
    };
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_directory() -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "macro-stack-data-test-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir(&path).unwrap();
        path
    }

    fn binding(uid: u32, host_id: &str) -> OperatorBinding {
        OperatorBinding {
            format_version: OPERATOR_BINDING_VERSION,
            uid,
            host_id: host_id.to_owned(),
        }
    }

    #[test]
    fn rejects_a_second_uid_for_the_same_daemon_project_and_host() {
        let designated = binding(501, "host-a");
        let second_user = binding(502, "host-a");
        assert!(super::validate_operator_binding(&designated, &second_user).is_err());
    }

    #[test]
    fn rejects_the_same_uid_from_another_host() {
        let designated = binding(501, "host-a");
        let remote_host = binding(501, "host-b");
        assert!(super::validate_operator_binding(&designated, &remote_host).is_err());
    }

    #[test]
    fn cross_uid_handoff_fails_closed_before_touching_the_host() {
        let args = OperatorHandoffArgs {
            instance: Default::default(),
            to_uid: operator_uid().wrapping_add(1),
        };
        let error = handoff_operator(&args).unwrap_err();
        assert!(error.to_string().contains("handoff is unsupported"));
    }

    #[cfg(unix)]
    #[test]
    fn legacy_handoff_record_cannot_silently_roll_back_the_binding() {
        let directory = test_directory();
        let owner_path = directory.join("macro-stack-data-owner-test.json");
        let current = binding(operator_uid(), "host-a");
        ensure_operator_binding(&owner_path, &current).unwrap();
        let original = fs::read(&owner_path).unwrap();
        fs::write(
            directory.join("macro-stack-data-owner-test-handoff-2.json"),
            b"{}",
        )
        .unwrap();

        assert!(ensure_operator_binding(&owner_path, &current).is_err());
        assert_eq!(fs::read(&owner_path).unwrap(), original);
        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn removed_legacy_handoff_records_cannot_make_the_initial_owner_authoritative() {
        let directory = test_directory();
        let owner_path = directory.join("macro-stack-data-owner-test.json");
        let current = binding(operator_uid(), "host-a");
        let prior_chain_binding = format!(
            r#"{{"uid":{},"host_id":"host-a","generation":0,"writer_uid":{},"previous_sha256":null}}"#,
            current.uid, current.uid
        );
        fs::write(&owner_path, prior_chain_binding.as_bytes()).unwrap();

        assert!(ensure_operator_binding(&owner_path, &current).is_err());
        assert_eq!(fs::read(&owner_path).unwrap(), prior_chain_binding.as_bytes());
        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn unversioned_initial_pin_is_rejected_even_when_legacy_handoffs_are_gone() {
        let directory = test_directory();
        let owner_path = directory.join("macro-stack-data-owner-test.json");
        let current = binding(operator_uid(), "host-a");
        let old_pin = format!(r#"{{"uid":{},"host_id":"host-a"}}"#, current.uid);
        fs::write(&owner_path, old_pin.as_bytes()).unwrap();

        assert!(ensure_operator_binding(&owner_path, &current).is_err());
        assert_eq!(fs::read(&owner_path).unwrap(), old_pin.as_bytes());
        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn foreign_uid_cannot_replace_the_pinned_lock_inode() {
        use std::os::unix::fs::MetadataExt;

        let directory = test_directory();
        let path = directory.join("project.lock");
        let uid = operator_uid();
        let other_uid = uid.wrapping_add(1);
        let first = acquire_operation_lock(&path, uid, uid, "test operation").unwrap();
        let inode = first.metadata().unwrap().ino();
        assert_eq!(first.metadata().unwrap().mode() & 0o777, 0o600);

        assert!(open_operation_lock_file(&path, uid, other_uid).is_err());
        assert_eq!(fs::metadata(&path).unwrap().ino(), inode);
        assert!(acquire_operation_lock(&path, uid, uid, "test operation").is_err());
        drop(first);
        let second = acquire_operation_lock(&path, uid, uid, "test operation").unwrap();
        assert_eq!(second.metadata().unwrap().ino(), inode);
        drop(second);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn an_incomplete_staging_file_does_not_poison_the_atomic_operator_claim() {
        let directory = test_directory();
        let owner_path = directory.join("macro-stack-data-owner-test.json");
        fs::write(
            directory.join(".macro-stack-data-owner-test.json.tmp-501-1-1"),
            b"{",
        )
        .unwrap();
        let current = binding(operator_uid(), "host-a");

        let recorded = ensure_operator_binding(&owner_path, &current).unwrap();

        assert_eq!(recorded.uid, current.uid);
        assert_eq!(recorded.host_id, current.host_id);
        let bytes = fs::read(&owner_path).unwrap();
        assert!(serde_json::from_slice::<OperatorBinding>(&bytes).is_ok());
        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn truncated_legacy_binding_cannot_be_repaired_after_handoff_removal() {
        use std::os::unix::fs::PermissionsExt;

        let directory = test_directory();
        let owner_path = directory.join("macro-stack-data-owner-test.json");
        let handoff_path = directory.join("macro-stack-data-owner-test-handoff-1.json");
        let current = binding(operator_uid(), "host-a");
        fs::write(
            &owner_path,
            format!(
                r#"{{"uid":{},"host_id":"host-a","generation":0,"writer_uid":{},"previous_sha256":null}}"#,
                current.uid, current.uid
            ),
        )
        .unwrap();
        fs::write(&handoff_path, b"{}").unwrap();
        fs::remove_file(&handoff_path).unwrap();
        let truncated_legacy_binding = b"{";
        fs::write(&owner_path, truncated_legacy_binding).unwrap();
        fs::set_permissions(&owner_path, fs::Permissions::from_mode(0o600)).unwrap();

        assert!(ensure_operator_binding(&owner_path, &current).is_err());
        assert_eq!(fs::read(&owner_path).unwrap(), truncated_legacy_binding);
        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn binding_for_another_host_is_rejected_without_rewrite() {
        use std::os::unix::fs::PermissionsExt;

        let directory = test_directory();
        let owner_path = directory.join("macro-stack-data-owner-test.json");
        let uid = operator_uid();
        let original = binding(uid, "host-a");
        let original_bytes = serde_json::to_vec(&original).unwrap();
        fs::write(&owner_path, &original_bytes).unwrap();
        fs::set_permissions(&owner_path, fs::Permissions::from_mode(0o600)).unwrap();
        let current = binding(uid, "host-b");

        assert!(ensure_operator_binding(&owner_path, &current).is_err());
        assert_eq!(fs::read(&owner_path).unwrap(), original_bytes);
        fs::remove_dir_all(directory).unwrap();
    }
}
