import Foundation

@objc public class fingercosmos: NSObject {
    @objc public func echo(_ value: String) -> String {
        print(value)
        return value
    }
}
