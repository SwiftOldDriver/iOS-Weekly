## [Swift 5 Release Notes for Xcode 10.2](https://developer.apple.com/documentation/xcode_release_notes/xcode_10_2_release_notes/swift_5_release_notes_for_xcode_10_2)

Swift5 正式更新，官方提供了更新笔记说明，我们周报编辑团队的 [@Tom](https://xiaozhuanlan.com/u/6682065345) 组织 [@老老老老老老老驴](https://weibo.com/u/6090610445)，[@小非86](https://weibo.com/xuyafei86)，[@邦ben](http://weibo.com/linwenbang) 和 [@极速男孩](https://github.com/ztlyyznf001) 为大家做了第一手的翻译工作，方便大家了解这次对于 Swift 发展史很重要的一次迭代。另外，[@Tom](https://xiaozhuanlan.com/u/6682065345) 所在的深圳头条研发中心正在招募各路好手，有兴趣的可以加他微信 tomtan，切磋技术和聊情怀都可以喔~~~~

### 概要

在 Xcode10.2 版本中，将可以使用 Swift5.0 进行开发

### 总体（General）

#### Swift 5 运行时对命令行工具的支持

- Swift 命令行工具从 Xcode 10.2 开始需要依赖于 macOS 中的Swift库。这些库将从 macOS Mojave 10.14.4 开始默认包含在 macOS 中。在 macOS Mojave 10.14.3 和更早的版本中，可以选择从  [More Downloads for Apple Developers](https://developer.apple.com/download/more/) 下载 Swift 命令行工具所需要的运行时库。如果你安装了 beta 版本，需要将其替换成正式版本。只有在 Swift 命令行工具中才需要这个包，而并不适用于具有图形用户界面的应用程序。

### App 瘦身（App Thinning）

#### 新特性

 - Swift 不再包含 Swift 标准库的动态链接，并且会在 iOS 12.2, watchOS 5.2, and tvOS 12.2 中内置 Swift SDK 。从而 Swift apps 在你上传 App Store ，发布 TestFlight 测试，和本地打包时会变得更小。

    想要比较应用在 iOS 12.2 和 iOS 12.1 之前版本瘦身的大小的区别，你可以把应用的 deployment target 设为 iOS 12.1 或之前的版本，然后将scheme 设为 Generic iOS Device 生成一个归档文件。然后用选择 Archives organizer 中的发布应用中的 Development distribution。确定在 App Thinning 的下拉菜单中选中某个特定的设备如：iPhone XS 。当发布完成以后，在刚刚创建的文件夹中打开 App Thinning Size Report ，可以看到 iOS 12.2 的安装包要比 iOS 12.1 或者更早的版本要小。准确的大小差别取决于你的 app 使用系统框架的数量。

    想要获取更多 app 瘦身的信息，可以参考 [Xcode Help](https://help.apple.com/xcode/mac/current/) 中的  [What is app thinning?](https://help.apple.com/xcode/mac/current/#/devbbdc5ce4f) 。

    获取更多 app文件大小的信息，可以参考 [App Store Connect Help](https://help.apple.com/app-store-connect/) 中的  [View builds and file sizes](https://help.apple.com/app-store-connect/#/dev3b56ce97c) 。

### Swift 语言特性（Swift Language）

#### 新特性

- 字符串的声明，现在可以使用更好用的分隔符了。当使用（#）号来包住一个字符串的时候，可以使用多个（#）号来分割纯字符和变量声明。使用增强的分隔符，可以避免写得很混乱的字符串转义声明。（[SE-0200](https://github.com/apple/swift-evolution/blob/master/proposals/0200-raw-string-escaping.md)）（47725014）：
  
    ```swift
    print(#"<a href="\#(url)" title="Apple Developer">"#)
    // 等价于:
    print("<a href=\"\(url)\" title=\"Apple Developer\">")
    ```

- 如果声明的类型与标准库中的类型具有相同的名称，则会覆盖了标准库中的类型声明。（46767892）

    例如，在模块 Foo 中声明了一个类型，名字是 Result
    ```swift
    // Module `Foo`.
    public enum Result<T> {
        case value(T)
        case error(Error)
    }
    ```

    这样在任何使用了 Foo 模块的代码中，Result 类型都将被认为是 ```Foo.Result```：
    ```Swift
    import Foo
    
    func doSomething() -> Result<Int> { /* … */ }
    ```

    那么如果真的想要引用标准库中的 [Result](https://developer.apple.com/documentation/swift/result) 类型，那么必须加上显式的声明：

    ```swift
    import Foo
    
    func useStandardLibraryResult() -> Swift.Result<Int, Error> { /* … */ }
    ```

- 如果一个变量声明为```@dynamicCallable```的话，这样可以使用一个函数调用的语法糖，这个语法糖主要的使用场景是动态语言互操作（[SE-0216](https://github.com/apple/swift-evolution/blob/master/proposals/0216-dynamic-callable.md)）（47325423）

    例如：
    ```swift
    @dynamicCallable struct ToyCallable {
        func dynamicallyCall(withArguments: [Int]) {}
        func dynamicallyCall(withKeywordArguments: KeyValuePairs<String, Int>) {}
    }
    
    let x = ToyCallable()
    
    x(1, 2, 3)
    // 上面的代码实际上是一个语法糖，如果不用语法糖的话，代码会像这样子写  `x.dynamicallyCall(withArguments: [1, 2, 3])`
    
    x(label: 1, 2)
    // 上面的代码实际上是一个语法糖，如果不用语法糖的话，代码会像这样子写   `x.dynamicallyCall(withKeywordArguments: ["label": 1, "": 2])`
    ```

- ```标识键路径（Key paths）```功能现在支持一个特殊的标记方式```（\.self）```，[WritableKeyPath](https://developer.apple.com/documentation/swift/writablekeypath) 指代了整个输入值（[SE-0227](https://github.com/apple/swift-evolution/blob/master/proposals/0227-identity-keypath.md)）（40538312）

    ```swift
    let id = \Int.self
    var x = 2
    print(x[keyPath: id]) // Prints "2"
    x[keyPath: id] = 3
    print(x[keyPath: id]) // Prints "3"
    ```

- 在 Swift5 之前，可以编写一个带有可变参数的枚举体：

    ```swift
    enum X {
        case foo(bar: Int...) 
    }
     func baz() -> X {
        return .foo(bar: 0, 1, 2, 3) 
    } 
    ```
    这不是一个特意支持的特性，现在会产生编译错误了。（46821582）
    相对地，你可以用数组的声明来代替可变参数声明：
    
    ```swift
    enum X {
        case foo(bar: [Int]) 
    } 
     func baz() -> X {
        return .foo(bar: [0, 1, 2, 3]) 
    } 
    ```

- 在 Swift5 下，```try?```如果用在[可选类型](https://developer.apple.com/documentation/swift/optional)上的话，就算是多层使用，也不会导致返回值是一个多层嵌套的可选类型了。（[SE-0230](https://github.com/apple/swift-evolution/blob/master/proposals/0230-flatten-optional-try.md)）（47313584）

- 如果一个类型```T```符合 [Initialization with Literals](https://developer.apple.com/documentation/swift/swift_standard_library/initialization_with_literals) 中的一个协议，例如 [ExpressibleByIntegerLiteral](https://developer.apple.com/documentation/swift/expressiblebyintegerliteral) ，并且是一个标量表达式的话，那么将不需要一直使用```T```用在泛型协议声明中了

    例如：现在可以这样子写一个变量表达式
    
    ```swift
    UInt64(0xffff_ffff_ffff_ffff) 
    ```
    
    在之前的版本的话将会导致 [Int](https://developer.apple.com/documentation/swift/int) 溢出错误。（[SE-0213](https://github.com/apple/swift-evolution/blob/master/proposals/0213-literal-init-via-coercion.md)）（17088188）

- 字符串插入大幅提高了性能表现。（[SE-0228](https://github.com/apple/swift-evolution/blob/master/proposals/0228-fix-expressiblebystringinterpolation.md)）（43621912）

- 一个旧的协议```_ExpressibleByStringInterpolation```被移除了。如果你希望继续使用这个协议的话，你可以通过条件编译选项来实现新老板本的兼容。

    例如：
    ```swift
    #if compiler(<5)
    extension MyType: _ExpressibleByStringInterpolation { /*...*/ }
    #else
    extension MyType: ExpressibleByStringInterpolation { /*...*/ }
    #endif 
    ```

### Swift 标准库（Swift Standard Library）

#### 新特性

- 标准库现在包括 `Result` 枚举 ` Result.success(_:)` 和 `Result.failure(_:)` 。在`do-catch` 语句和 `try` 表达式不能使用的情况下(例如在使用可能失败的异步api时)，使用 `Result` 手动传递和处理错误。

    作为添加的一部分，`Error` 协议的自我一致性，这使得在通用上下文中处理错误更加容易。([SE-0235](https://github.com/apple/swift-evolution/blob/master/proposals/0235-add-result.md))(21200405)

- [SIMD](https://developer.apple.com/documentation/swift/simd) 类型和基本操作符现在在标准库中定义。在 `simd` 框架提供的类型中， [float2](https://developer.apple.com/documentation/simd/float2) 和 [float3](https://developer.apple.com/documentation/simd/float3)，现在是新标准库类型的类型别名。
  
    `SIMD` 类型是标量元素类型上的泛型。例如，旧的 [float3](https://developer.apple.com/documentation/simd/float3) 类型是 `SIMD3<Float>` 的类型别名。任何符合 [SIMDScalar](https://developer.apple.com/documentation/swift/simdscalar) 协议的类型都可以用作 `SIMD` 向量的标量类型，但是有效的向量化依赖于为相关的 [SIMDStorage](https://developer.apple.com/documentation/swift/simdstorage) 类型选择一个良好的数据布局并进行有效的下标操作。
   
    大多数使用 `simd` 类型的现有代码可以继续使用新的泛型 `simd` 类型，但是需要注意一些更改。
   
    新类型增加了一些新的一致性; [SIMD](https://developer.apple.com/documentation/swift/simd) 向量现在是 [Hashable](https://developer.apple.com/documentation/swift/hashable) 、[Equatable](https://developer.apple.com/documentation/swift/equatable) 和 [Codable](https://developer.apple.com/documentation/swift/codable)。这可能允许您删除在您自己的代码中提供这些一致性的一些现有扩展。
    
    为提供向量标量算法而重载的运算符集得到了极大的扩展。这使得编写一些东西变得更容易，但是在某些情况下会给 `typechecker` 带来歧义，并且可能需要分解一些表达式或使用显式类型进行注释。

    由于现在的类型是泛型而不是具体的，如果您已经在 `simd` 框架类型上定义了自己的协议，那么可能有必要重构一致性，因为 `Swift` 泛型类型不能对协议有多个条件一致性。这种情况相对比较少见，但通常需要重构如下代码:

    ```swift
    protocol MyVectorProtocol { /* ... */ }
    extension float2: MyVectorProtocol { /* ... */ }
    extension double2: MyVectorProtocol { /* ... */ }

    ```

    要改为使用以下结构：

    ```swift
    protocol MySIMDScalarProtocol: SIMDScalar { /* ... */ }
    extension SIMD2 where Scalar: MySIMDScalarProtocol { /* ... */ }
    // Or even:
    protocol MySIMDScalarProtocol: SIMDScalar { /* ... */ }
    extension SIMD where Scalar: MySIMDScalarProtocol { /* ... */ }
    ```

    这种更改通常允许您删除许多冗余实现，但它要求您定义任何必要的实现 `Hook`，这些 `Hook` 引用 `Darwin` 系统上标量类型的C头文件中的具体函数。([SE-0229](https://github.com/apple/swift-evolution/blob/master/proposals/0229-simd.md))(17045503)

- [Set](https://developer.apple.com/documentation/swift/set) 和 [Dictionary](https://developer.apple.com/documentation/swift/dictionary) 现在为每个新创建的实例使用不同的散列种子。因此，在 [Set](https://developer.apple.com/documentation/swift/set) 和 [Dictionary](https://developer.apple.com/documentation/swift/dictionary) 中，元素的顺序每次都会改变:

    ```swift
    let a: Set<Int> = [1, 2, 3, 4, 5]
    let b: Set<Int> = [1, 2, 3, 4, 5]
    a == b  // true
    print(a) // [1, 4, 3, 2, 5]
    print(b) // [4, 2, 5, 1, 3]
    ```

    现有的代码错误地假设两个不相关但相等的集合或字典将以相同的顺序包含元素，这在 `Swift 5` 中更容易产生错误的结果。尽管元素顺序在不同的 `Set` 或 `Dictionary` 实例之间并不稳定，但是在同一个实例上的多次迭代之间，顺序不会发生变化。除了强调这些集合不能保证一致的元素顺序外，此更改还修复了大量操作的情况。例如：`union(_:)` 二次性能。（44760778）

- 为了防止 `Cocoa` 对象的不一致哈希，`NSObject` 上的 [hashValue](https://developer.apple.com/documentation/objectivec/nsobject/1418615-hashvalue) 属性不再是可重写的。在 `Swift 4.2` 废弃重写 `hashValue`。要在 `NSObject` 子类中重写属性 [hash](https://developer.apple.com/documentation/objectivec/nsobjectprotocol/1418859-hash) 来自定义哈希值。下面展示一个例子:

    ```swift
    class Person: NSObject {
        let name: String

        init(name: String) {
            self.name = name
            super.init()
        }

        override func isEqual(_ other: Any?) -> Bool {
            guard let other = other as? Person else { return false }
            return other.name == self.name
        }

        override var hash: Int {
            var hasher = Hasher()
            hasher.combine(name)
            return hasher.finalize()
        }
    }
    ```

    哈希和相等判断是相辅相成。如果重写 `hash`，还需要覆盖 `isEqual(_:)`，反之亦然。(42623458)

- [DictionaryLiteral](https://developer.apple.com/documentation/swift/dictionaryliteral) 类型改名成 [KeyValuePairs](https://developer.apple.com/documentation/swift/keyvaluepairs)。 ([SE-0214](https://github.com/apple/swift-evolution/blob/master/proposals/0214-DictionaryLiteral.md)) (23435865)

- `Swift` 字符串桥接到 `Objective-C` 可能适当地在 [CFStringGetCStringPtr(_:_:)](https://developer.apple.com/documentation/corefoundation/1542133-cfstringgetcstringptr) 返回非 `nil` 值，而从 `UTF8String` 方法返回的指针则绑定到字符串的生命周期，而不是最内层的自动释放池。正确的程序应该不会有任何问题，并可能看到显著的加速。但是，它可能导致以前未测试的代码运行，从而暴露潜在的bug；例如，如果对非 nil 值进行检查，该分支可能从未在 `Swift 5` 之前被执行过。(26236614)

- [Sequence](https://developer.apple.com/documentation/swift/sequence) 协议不再具有 `SubSequence` 关联类型。以前返回子序列的 `Sequence` 上的方法现在返回具体类型。例如，[suffix(_:)](https://developer.apple.com/documentation/swift/sequence/3128822-suffix) 现在返回一个数组。(45761817)
  
    使用子序列的序列上的扩展应该修改为类似地使用具体类型，或者修改为 [Collection](https://developer.apple.com/documentation/swift/collection) 上的扩展(如果子序列仍然可用)。

    例如：

    ```swift
    extension Sequence {
        func dropTwo() -> SubSequence {
            return self.dropFirst(2)
        }
    }
    ```

    变为：

    ```swift
    extension Sequence {
        func dropTwo() -> DropFirstSequence<Self> { 
            return self.dropFirst(2)
        }
    }
    ```

    或者：

    ```swift
    extension Collection {
        func dropTwo() -> SubSequence {
            return self.dropFirst(2)
        }
    }
    ```

- [String](https://developer.apple.com/documentation/swift/string) 结构的本地编码从 `UTF-16` 转换为 `UTF-8`，这可能会提高 `String.UTF8View` 相对 `String.UTF16View` 的性能。考虑重新评估使用 `String.UTF16View` 来调优性能的代码。(42339222)

#### 已知的问题

- Xcode 10.2 beta 版本 [Sequence](https://developer.apple.com/documentation/swift/sequence?language=objc) 协议中增加的 ```count(where:)``` 方法已经被移除。(47549309)
**解决方案：**使用 [reduce(_:_:)](https://developer.apple.com/documentation/swift/anycollection/2906169-reduce?language=objc) 可以高效率地计算与谓词匹配的出现次数：

    ```swift
    let occurrences = sequence.reduce(0) { predicate($1) ? $0 + 1 : $0 }
    ```

#### 已解决的问题

- 可以按预期在字符串上设置 `utf8` 属性。(47864538)

- 传递 null [UnsafeBufferPointer](https://developer.apple.com/documentation/swift/unsafebufferpointer?language=objc)<UInt8> 给 [String](https://developer.apple.com/documentation/swift/string?language=objc) 结构体的 [init(decoding:as:)](https://developer.apple.com/documentation/swift/string/2907004-init?language=objc) 初始化方法现在可以正常的返回空字符串。 (47864610)

### Swift 包管理（Swift Package Manager）

#### 新特性

- 当使用 `Swift 5 Package.swift tools-version` 时，`Targets` 可以声明一些常用的、特定于目标的构建设置。还可以根据平台和构建配置对新设置进行条件设置。所包含的构建设置支持 `Swift` 和 `C` 语言定义、`C` 语言头文件搜索路径、链接库和链接 framework。([SE-0238](https://github.com/apple/swift-evolution/blob/master/proposals/0238-package-manager-build-settings.md))(23270646)

- 当使用 `Swift 5 Package.swift tools-version` 时，可以指定最低部署版本。如果包的任何包依赖项指定的最小部署目标大于包本身的最小部署目标，则构建会出现错误。([SE-0236](https://github.com/apple/swift-evolution/blob/master/proposals/0236-package-manager-platform-deployment-settings.md)) (28253354)

- 一个新的依赖项镜像特性允许顶级包覆盖依赖项url。([SE-0219](https://github.com/apple/swift-evolution/blob/master/proposals/0219-package-manager-dependency-mirroring.md))(42511642)

    使用以下命令设置镜像：
    ```
    $ swift package config set-mirror \
    --package-url <original URL> --mirror-url <mirror URL>
    ```

- `swift test` 命令可以以一种标准格式生成代码覆盖率数据，这种格式适合使用标记 `--enable-code-coverage` 的其他代码覆盖率工具使用。生成的代码覆盖率数据在`<build-dir>/<configuration>/codecov` 中可用。(44567442)

- `Swift 5` 不再支持 `Swift 3 Package.swift tools-version`。仍然在 `Swift 3 Package.swift tools-version` 的包应该更新到一个新版本。(41974124)

- 包管理器处理大型包的速度显著加快了。(35596212)

- Swift 包管理器有一个新的 `--disable-automatic-resolution` 标志，它强制包解析在包失败时失效。已解析项不再与 `Package.swift manifest` 文件中指定的依赖项版本兼容。这个特性对于持续集成系统检查包 `Package.resolved` 是否过期非常有用。(45822895)

- `swift run` 命令有一个新的 `--repl` 选项，该选项启动 `Swift REPL`，支持导入目标包的库。这使您可以轻松地从包目标测试API，而不需要构建调用该API的可执行文件。(44889181)

- 有关使用Swift包管理器的更多信息，请访问上 [swift.org](https://swift.org/) 的 [Using the Package Manager](https://swift.org/getting-started/#using-the-package-manager)。

### Swift Compiler

#### 新特性

- 为了减少 Swift 元数据的占用体积，Swift 中的 convenience initializers 现在将不会提前分配内存空间，除非其调用了在 Objective-C 中定义的 designated initializer。多数情况下，这不会对你的 app 产生任何影响。唯一例外是当你的 convenience Initializers 被 Objective-C 调用，同时，没有调用自身暴露给 Objective-C 的 `self.init` ，那么[最初始分配的内存空间](https://developer.apple.com/documentation/objectivec/nsobject/1571958-alloc?language=objc)会在没有调用任何 initializer 下被释放掉。这可能会对使用 initializer 的人产生困扰，因为他们并没有意识有 object replacement 的发生。一个例子是 [`initWithCoder:`](https://developer.apple.com/documentation/foundation/nscoding/1416145-initwithcoder?language=objc)：[`NSKeyedUnarchiver`](https://developer.apple.com/documentation/foundation/nskeyedunarchiver?language=objc) 如果调用了在 Swift 中定义的 `initWithCoder:` 并且保存了存在循环的对象图，它最后的实现将会出错。

  要避免这样的问题，你需要保证 convenience initializers 不支持 object replacement，同时，确保最终调用的 initializers 暴露给 Objective-C，这可以是在 Objective-C 中定义 initializers，或是被标记了 `@objc`，亦或是他们被暴露给 Objective-C 的 initializers 覆写了，也可以是他们遵从任何一个标记了 `@objc` 的协议。

- 超过 16 字节对齐的 C 语言类型已不再被 Swift 支持。其实，之前版本 Swift 编译器也没有正确的处理这些类型过。(31411216)

- 在 Swift 5 模式中，非 `final` 类的 convenience initializer 中 Self 的类型是动态的 Self 类型，而非具体类型了。(47323459)

- 在 `optimized build`（`-O` 和 `-Osize`） 设置下，独占内存访问会在 runtime 中默认强制启用。若程序在 runtime 中违反独占内存访问，则程序会产生一条诊断信息：“Simultaneous accesses to […], but modification requires exclusive access"。你可以通过用命令行标记 -enforce-exclusivity=unchecked 来禁用检查，但是可能会导致产生未知的结果。Runtime 中违反独占内存访问一般会是由同时对类属性和全局变量（包括顶层代码中的变量和被逃逸闭包持有的变量）同时访问导致的。更多信息，请查看 [Swift 5 Exclusivity Enforcement](https://swift.org/blog/swift-5-exclusivity/). ([SR-7139](https://bugs.swift.org/browse/SR-7139)) (37830912)

- 移除对 Swift 3 的支持。现在编译器支持的 `-swift-version` 是 4，4.2 和 5。

- 在 Swift 5 中，在 Switch 中遍历在 Objective-C 中定义的，或由系统框架定义的枚举时，将被要求处理 unknown case。Unknown case 有可能来自于后来新增或在 Objective-C 的 `.m` 文件里进行私有定义。之前，Objective-C 允许枚举变量储存符合定义类型的任何值。这些情况现在都可以用新的  `@unknown default` 来处理。不用担心，编译器依然会对漏掉的 case 进行警告。当然，普通的 `default` 也是可以处理的。

  如果你在 Objective-C 自定义了枚举变量，也不需要客户端对未知情况进行处理的话，那么，你可以使用 `NS_CLOSED_ENUM` 宏来代替 `NS_ENUM`。 Swift 编译器会识别这些宏，之后，就不会再要求对 `default` case 处理了。

   在 Swift 4 和 Swift 4.2 模式下，你还是可以使用 `@unknown default` 进行处理。如果你没有添加 `@unknown default`， 而 runtime 中有未知 case 传入，runtime 会捕获到这样的异常，这和 Xcode 10.1 中的 Swift 4.2 是一致的。([SE-0192](https://github.com/apple/swift-evolution/blob/master/proposals/0192-non-exhaustive-enums.md)) (39367045）

- 现在 SourceKit 生成的 Swift Modules 的接口中，默认参数会被显示出来，而非之前用 `placeholder default` 来显示。(18675831)

- `unowned` 和 `unowned(unsafe)` 变量现已支持 [`Optional`](https://developer.apple.com/documentation/swift/optional?language=objc) 类型。(47326769)

### Known Issues

- Key Path 中如果引用另外一个 Swift Module 中 `Protocol Extension` 中的属性，可能会导致编译器奔溃。(48001932)

  暂时解决方案：在当前 Module 中定义中间属性（`wrapper property`），在 key path 中引用这个中间属性而非原有属性。
  
- 若启用`Thread Sanitizer`，可能导致 Swift 编译器在编译过程中奔溃。

  暂时解决方案：在 `Scheme Editor` 的 `Diagnostics` 标签页下禁用 `Thread Sanitizer`。
  
- 链接静态 Swift 库可能会导致创建的二进制程序中缺失类型元数据，原因是静态库中的定义元数据的 Object 文件被错误的当做未使用。

  这有可能导致一个 Swift runtime 错误，同时会有类似 “failed to demangle superclass of MyClass from mangled name ‘<mangled name>’” 的错误信息。
  
  暂时解决方案：如果你能重新编译静态库，请尝试启用 `whole module optimization` 下进行编译。 否则，可以考虑添加 `-all_load` 到客户端二进制程序的链接器中来保证所有的 Object 文件都被链接入二进制程序。
  
- `self.init()` 在 [NSView](https://developer.apple.com/documentation/appkit/nsview?language=objc) 和 [UIView](https://developer.apple.com/documentation/uikit/uiview?language=objc) 的子类的 designated initializers 未被禁止，即便 `init()` 在 NSView 和 UIView 中是 convenience initializer。使用 `self.init()` 可能会导致储存属性被多次初始化，最终可能导致内存泄漏或者是其他问题。(SR-9836) (47734208)

  暂时解决方案：使用 `super.init(frame:)` 来替代 `self.init()`

### Resolved Issues

- 除非你安装 Swift 5 命令行工具包的运行时支持，否则 Swift 命令行项目将无法在 macOS 10.14.3 及更早版本上运行。 如果没有该工具包，Swift 命令行项目会在启动时因“dyld：Library not loaded” 错误而崩溃。(46824656)

- 直接从命令行用 swiftc 编译器链接一个 Swift 项目，现在可以在 macOS Mojave 10.14.4 上输出正确的结果。(43616773)

- 与 Xcode 10.1 相比，Xcode 10.2 中的编译时间倒退现在在大多数情况下得到解决。 有些项目可能会继续经历小幅倒退；文件错误报告会记录您遇到的案例。(47304789)

- 即使引用了 [UIAccessibility](https://developer.apple.com/documentation/uikit/uiaccessibility?language=objc) 结构体的成员或包含 NS_ERROR_ENUM 嵌套类型的其他类型，Swift 编译器也会完成“Merge swiftmodule”构建步骤。(47152185)

- 在某些上下文中允许使用单元素标记的元组表达式，如 (```label:123```)，但通常会导致令人惊讶的，不一致的行为，这些行为在编译器版本中会有所不同。 他们现在完全被禁止了。
在 Swift 3 中已经禁止使用单元素标记类型，如```var x:(label：Int)```。([SR-8109](https://bugs.swift.org/browse/SR-8109)) (41474370)

- 如果 KeyPath 字面量引用了在 Objective-C 中定义的属性或者在 Swift 中使用 @objc 和动态修饰符定义的属性，它
现在可以成功编译并在运行时生成正确的哈希值或与其他 KeyPath 的相等比较。(47184763)

- 扩展绑定现在支持嵌套类型的扩展，这些类型本身是在扩展内定义的。之前可能会因为声明顺序问题而失败，出现“undeclared type”错误。([SR-631](https://bugs.swift.org/browse/SR-631)) (20337822)

- In Swift 5 mode, inferred associated types are no longer exposed publicly when a public type conforms to a non-public protocol. Instead, they get the minimum possible access to be visible from both the protocol and the conforming type. For source compatibility, Swift 4 and 4.2 modes continue to expose inferred associated types as publicly as the enclosing type unless the inferred associated type is itself less public than the conforming type. 

    在 Swift 5 模式下，当公共类型实现非公共协议时，推断的关联类型不再公开。 相反，它们获得同时对协议和实现类型可见的最小访问权限。对于版本兼容性，Swift 4 和 4.2 模式继续将推断的关联类型公开为封闭类型，除非推断的关联类型本身不如实现类型开放。(46143405)

- 在 Swift 5 模式下，返回 Self 的类方法不能再使用返回具体类类型（非 final）的方法来覆盖。这类代码不是类型安全的，需要将它们改掉。 ([SR-695](https://bugs.swift.org/browse/SR-695)) (47322892)

    例如：
    
    ```swift
    class Base { 
        class func factory() -> Self { /*...*/ }
    } 
    
    class Derived: Base {
        class override func factory() -> Derived { /*...*/ } 
    } 
    ```

- 在 Swift 5 模式下，现在明确禁止声明与嵌套类型同名的静态属性，而之前可以在泛型类型的扩展中进行这样的声明。([SR-7251](https://bugs.swift.org/browse/SR-7251)) (47325738)

    例如：
    
    ```swift
    struct Foo<T> {}
    extension Foo { 
        struct i {}
    
        // Error: Invalid redeclaration of 'i'.
        // (Prior to Swift 5, this didn’t produce an error.) 
        static var i: Int { return 0 }
    }
    ```

- 现在可以在子类中正确继承具有可变参数的指定初始化器。(16331406)

- 在 Swift 5 模式下，@autoclosure 参数不能再被转发给另一个函数调用的 @autoclosure 参数。相反，你必须使用括号显式调用函数值。调用将被包含在一个隐式闭包中，保证了与 Swift 4 模式相同的行为。([SR-5719](https://bugs.swift.org/browse/SR-5719)) (37321597)

    例如：
    
    ```swift
    func foo(_ fn: @autoclosure () -> Int) {}
    func bar(_ fn: @autoclosure () -> Int) {
        foo(fn) // Incorrect, `fn` can’t be forwarded and has to be called.
        foo(fn()) // OK
    } 
    ```

- 现在完全支持复杂的递归类型定义，包括之前在运行时会导致死锁的类和泛型。(38890298)

- 在 Swift 5 模式下，在将 Optional 值转换为通用占位符类型时，编译器在展开值时会更加保守。这种转换结果现在更接近于非通用上下文中获得的结果。([SR-4248](https://bugs.swift.org/browse/SR-4248)) (47326318)

    例如：
    
    ```swift
    func forceCast<U>(_ value: Any?, to type: U.Type) -> U {
        return value as! U 
    } 
    
    let value: Any? = 42
    print(forceCast(value, to: Any.self))
    // Prints "Optional(42)"
    // (Prior to Swift 5, this would print "42".)
    
    print(value as! Any)
    // Prints "Optional(42)"
    ```

- 协议现在可以将符合类型限定为给定类的子类。支持两种等效形式：

    ```swift
    protocol MyView: UIView { /*...*/ }
    protocol MyView where Self: UIView { /*...*/ } 
    ```
    Swift 4.2 接受了第二种形式，但还没有完全实现，在编译时或运行时偶尔会发生崩溃。([SR-5581](https://bugs.swift.org/browse/SR-5581)) (38077232)

- Swift 4.2 接受了第二种形式，但还没有完全实现，在编译时或运行时偶尔会发生崩溃。
  - 在 Swift 5 模式下，当在自己的 didSet 或 willSet observer 中设置属性时，observer 现在只在 self 上设置属性（不管是隐式的还是显式的）时才会避免被递归调用。([SR-419](https://bugs.swift.org/browse/SR-419)) (32334826)
  
      例如：
      
    ```swift
    class Node {
        var children = [Node]() 
        var depth: Int = 0 {
            didSet { 
                if depth < 0 {
                    // Won’t recursively call didSet, because this is setting depth on self. 
                    depth = 0
                } 
    
                // Will call didSet for each of the children,
                // as this isn’t setting the property on self.
                // (Prior to Swift 5, this didn’t trigger property
                // observers to be called again.)
                for child in children { 
                    child.depth = depth + 1
                } 
            }
        }
    }
    ```

- 如果你使用 #sourceLocation 将生成文件中的行映射回源代码，那么诊断信息将显示在源文件中而不是生成文件中。(43647151)

- 使用泛型类型别名作为 @objc 方法的参数或返回类型不会再生成无效的 Objective-C 标头。([SR-8697](https://bugs.swift.org/browse/SR-8697)) (43347303)


