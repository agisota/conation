import FileProvider
import UniformTypeIdentifiers

/// Finder File Provider for Conation Disk.
///
/// This is scaffolding: the extension enumerates Личное + Spaces and refuses
/// content fetch until a signed-in Conation session exists. It does not mount
/// a working disk. Register the domain from the macOS app with
/// `NSFileProviderManager.add(NSFileProviderDomain(identifier:
/// "dev.conation.disk", displayName: "Conation Disk"))` — that call is not
/// wired yet.
final class FileProviderExtension: NSObject, NSFileProviderReplicatedExtension {
    required init(domain: NSFileProviderDomain) {
        super.init()
        _ = domain
    }

    func invalidate() {}

    func item(
        for identifier: NSFileProviderItemIdentifier,
        request: NSFileProviderRequest,
        completionHandler: @escaping (NSFileProviderItem?, Error?) -> Void
    ) -> Progress {
        let progress = Progress(totalUnitCount: 1)
        if let item = FileProviderItem.catalogItem(for: identifier) {
            completionHandler(item, nil)
        } else {
            completionHandler(nil, NSError(domain: NSFileProviderErrorDomain, code: NSFileProviderError.noSuchItem.rawValue))
        }
        progress.completedUnitCount = 1
        return progress
    }

    func fetchContents(
        for itemIdentifier: NSFileProviderItemIdentifier,
        version requestedVersion: NSFileProviderItemVersion?,
        request: NSFileProviderRequest,
        completionHandler: @escaping (URL?, NSFileProviderItem?, Error?) -> Void
    ) -> Progress {
        let progress = Progress(totalUnitCount: 1)
        // Honest: no Conation session in the extension yet. Finder shows
        // on-demand placeholders only.
        completionHandler(
            nil,
            FileProviderItem.catalogItem(for: itemIdentifier),
            NSError(domain: NSFileProviderErrorDomain, code: NSFileProviderError.notAuthenticated.rawValue)
        )
        progress.completedUnitCount = 1
        return progress
    }

    func createItem(
        basedOn itemTemplate: NSFileProviderItem,
        fields: NSFileProviderItemFields,
        contents url: URL?,
        options: NSFileProviderCreateItemOptions = [],
        request: NSFileProviderRequest,
        completionHandler: @escaping (NSFileProviderItem?, NSFileProviderItemFields, Bool, Error?) -> Void
    ) -> Progress {
        let progress = Progress(totalUnitCount: 1)
        completionHandler(nil, [], false, NSError(domain: NSFileProviderErrorDomain, code: NSFileProviderError.notAuthenticated.rawValue))
        progress.completedUnitCount = 1
        return progress
    }

    func modifyItem(
        _ item: NSFileProviderItem,
        baseVersion version: NSFileProviderItemVersion,
        changedFields: NSFileProviderItemFields,
        contents newContents: URL?,
        options: NSFileProviderModifyItemOptions = [],
        request: NSFileProviderRequest,
        completionHandler: @escaping (NSFileProviderItem?, NSFileProviderItemFields, Bool, Error?) -> Void
    ) -> Progress {
        let progress = Progress(totalUnitCount: 1)
        completionHandler(item, [], false, NSError(domain: NSFileProviderErrorDomain, code: NSFileProviderError.notAuthenticated.rawValue))
        progress.completedUnitCount = 1
        return progress
    }

    func deleteItem(
        identifier: NSFileProviderItemIdentifier,
        baseVersion version: NSFileProviderItemVersion,
        options: NSFileProviderDeleteItemOptions = [],
        request: NSFileProviderRequest,
        completionHandler: @escaping (Error?) -> Void
    ) -> Progress {
        let progress = Progress(totalUnitCount: 1)
        completionHandler(NSError(domain: NSFileProviderErrorDomain, code: NSFileProviderError.notAuthenticated.rawValue))
        progress.completedUnitCount = 1
        return progress
    }

    func enumerator(
        for containerItemIdentifier: NSFileProviderItemIdentifier,
        request: NSFileProviderRequest
    ) throws -> NSFileProviderEnumerator {
        FileProviderEnumerator(parent: containerItemIdentifier)
    }
}
