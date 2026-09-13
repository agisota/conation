import FileProvider

final class FileProviderEnumerator: NSObject, NSFileProviderEnumerator {
    private let parent: NSFileProviderItemIdentifier

    init(parent: NSFileProviderItemIdentifier) {
        self.parent = parent
        super.init()
    }

    func invalidate() {}

    func enumerateItems(
        for observer: NSFileProviderEnumerationObserver,
        startingAt page: NSFileProviderPage
    ) {
        observer.didEnumerate(FileProviderItem.children(of: parent))
        observer.finishEnumerating(upTo: nil)
    }

    func enumerateChanges(
        for observer: NSFileProviderChangeObserver,
        from syncAnchor: NSFileProviderSyncAnchor
    ) {
        observer.finishEnumeratingChanges(upTo: syncAnchor, moreComing: false)
    }

    func currentSyncAnchor(completionHandler: @escaping (NSFileProviderSyncAnchor?) -> Void) {
        completionHandler(NSFileProviderSyncAnchor(Data("conation-disk-v0".utf8)))
    }
}
