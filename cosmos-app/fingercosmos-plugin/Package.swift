// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "FingercosmosPlugin",
    platforms: [.iOS(.v14)],
    products: [
        .library(
            name: "FingercosmosPlugin",
            targets: ["fingercosmosPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "7.0.0")
    ],
    targets: [
        .target(
            name: "fingercosmosPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/fingercosmosPlugin"),
        .testTarget(
            name: "fingercosmosPluginTests",
            dependencies: ["fingercosmosPlugin"],
            path: "ios/Tests/fingercosmosPluginTests")
    ]
)