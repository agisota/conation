use super::*;
use std::time::Duration;

#[test]
fn new_disk_has_personal_and_spaces_roots() {
    let disk = Disk::new();
    let personal = disk.get(&ItemId::personal_root()).expect("personal");
    assert_eq!(personal.name, "Личное");
    assert_eq!(personal.scope, Scope::Personal);
    assert_eq!(personal.pin, PinState::OnDemand);
    let spaces = disk.get(&ItemId::spaces_root()).expect("spaces");
    assert_eq!(spaces.name, "Spaces");
    assert!(matches!(spaces.scope, Scope::Space { .. }));
}

#[test]
fn add_personal_file_and_pin_offline() {
    let mut disk = Disk::new();
    let id = ItemId::new("doc-1");
    disk.add_item(
        id.clone(),
        ItemId::personal_root(),
        "notes.md".into(),
        Scope::Personal,
    )
    .unwrap();
    assert!(!disk.is_available_offline(&id));
    disk.set_pin(&id, PinState::PinnedOffline).unwrap();
    assert!(disk.is_available_offline(&id));
    disk.set_pin(&id, PinState::OnDemand).unwrap();
    assert!(!disk.is_available_offline(&id));
}

#[test]
fn addressed_share_is_revocable() {
    let mut disk = Disk::new();
    let id = ItemId::new("space-file");
    disk.add_item(
        id.clone(),
        ItemId::spaces_root(),
        "spec.pdf".into(),
        Scope::Space {
            space_id: "eng".into(),
        },
    )
    .unwrap();
    disk.share_with(&id, "user-ada").unwrap();
    disk.share_with(&id, "user-ada").unwrap();
    assert_eq!(disk.grants_for(&id).len(), 1);
    assert!(disk.revoke_share(&id, "user-ada"));
    assert!(disk.grants_for(&id).is_empty());
    assert!(!disk.revoke_share(&id, "user-ada"));
}

#[test]
fn public_link_expires_and_revokes() {
    let mut disk = Disk::new();
    let id = ItemId::new("pub");
    disk.add_item(
        id.clone(),
        ItemId::personal_root(),
        "share.md".into(),
        Scope::Personal,
    )
    .unwrap();
    let now = SystemTime::UNIX_EPOCH + Duration::from_secs(1_700_000_000);
    let live = disk
        .create_public_link(&id, now, Some(Duration::from_secs(60)))
        .unwrap();
    assert!(live.token.starts_with("cdlk-"));
    assert!(live.is_active(now + Duration::from_secs(30)));
    assert!(!live.is_active(now + Duration::from_secs(61)));
    let forever = disk.create_public_link(&id, now, None).unwrap();
    assert!(forever.is_active(now + Duration::from_secs(86_400)));
    assert!(disk.revoke_public_link(&forever.token, now));
    assert!(!disk.public_link(&forever.token).unwrap().is_active(now));
    assert!(!disk.revoke_public_link(&forever.token, now));
}

#[test]
fn file_provider_constants_match_extension_sources() {
    assert_eq!(FILE_PROVIDER_DOMAIN, "dev.conation.disk");
    assert_eq!(FILE_PROVIDER_DISPLAY_NAME, "Conation Disk");
    assert_eq!(
        FILE_PROVIDER_EXTENSION_POINT,
        "com.apple.fileprovider-nonui"
    );
    let dir = file_provider_extension_path();
    let plist = std::fs::read_to_string(dir.join("Info.plist")).expect("Info.plist");
    assert!(plist.contains(FILE_PROVIDER_EXTENSION_POINT), "{plist}");
    assert!(plist.contains("FileProviderExtension"), "{plist}");
    let ext = std::fs::read_to_string(dir.join("FileProviderExtension.swift")).unwrap();
    assert!(ext.contains("NSFileProviderReplicatedExtension"));
    let item = std::fs::read_to_string(dir.join("FileProviderItem.swift")).unwrap();
    assert!(item.contains(PERSONAL_ROOT_ID), "{item}");
    assert!(item.contains(SPACES_ROOT_ID), "{item}");
    let entitlements =
        std::fs::read_to_string(dir.join("FileProviderExtension.entitlements")).unwrap();
    assert!(entitlements.contains(FILE_PROVIDER_APP_GROUP));
}
