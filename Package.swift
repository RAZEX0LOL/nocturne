// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "NocturneCore",
    platforms: [.macOS(.v14), .iOS(.v17)],
    products: [.library(name: "NocturneCore", targets: ["NocturneCore"])],
    targets: [
        .target(name: "NocturneCore", path: "Nocturne/Core"),
        .testTarget(name: "NocturneCoreTests", dependencies: ["NocturneCore"])
    ]
)
