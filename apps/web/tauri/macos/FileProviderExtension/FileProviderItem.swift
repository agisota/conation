import FileProvider
import UniformTypeIdentifiers

/// One Finder row. Identifiers stay in lockstep with `conation_disk`.
final class FileProviderItem: NSObject, NSFileProviderItem {
    static let personalRoot = NSFileProviderItemIdentifier("conation-disk-personal")
    static let spacesRoot = NSFileProviderItemIdentifier("conation-disk-spaces")

    let itemIdentifier: NSFileProviderItemIdentifier
    let parentItemIdentifier: NSFileProviderItemIdentifier
    let filename: String
    let contentType: UTType
    let capabilities: NSFileProviderItemCapabilities

    init(
        identifier: NSFileProviderItemIdentifier,
        parent: NSFileProviderItemIdentifier,
        filename: String,
        folder: Bool
    ) {
        self.itemIdentifier = identifier
        self.parentItemIdentifier = parent
        self.filename = filename
        self.contentType = folder ? .folder : .item
        var caps: NSFileProviderItemCapabilities = [.allowsReading]
        if folder {
            caps.insert(.allowsAddingSubItems)
            caps.insert(.allowsContentEnumerating)
        }
        self.capabilities = caps
        super.init()
    }

    static func catalogItem(for identifier: NSFileProviderItemIdentifier) -> FileProviderItem? {
        switch identifier {
        case .rootContainer:
            return FileProviderItem(
                identifier: .rootContainer,
                parent: .rootContainer,
                filename: "Conation Disk",
                folder: true
            )
        case personalRoot:
            return FileProviderItem(
                identifier: personalRoot,
                parent: .rootContainer,
                filename: "Личное",
                folder: true
            )
        case spacesRoot:
            return FileProviderItem(
                identifier: spacesRoot,
                parent: .rootContainer,
                filename: "Spaces",
                folder: true
            )
        default:
            return nil
        }
    }

    static func children(of parent: NSFileProviderItemIdentifier) -> [FileProviderItem] {
        switch parent {
        case .rootContainer:
            return [
                catalogItem(for: personalRoot)!,
                catalogItem(for: spacesRoot)!,
            ]
        default:
            return []
        }
    }
}
