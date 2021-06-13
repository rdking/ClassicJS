# ClassicJS
This is a library designed to provide fully privileged member support to ES6 classes. This means you get the full treatment of the access specifiers you may have become accustomed to when using lanugages like C#, Java, & C++. You get all of this without losing support for any of the existing language features.

## Features
* Hard Version: No ability to leak private member names, but slower. Documented below.
* Fast Version: Faster, but less elegant syntax, and private member names can be leaked. See the [README.md](./fast/README.md) in the "./fast" directory for the differences.
* Private & Protected members on instances, even when Proxy-wrapped.
* Private static & Protected Static members on Classic constructors.
* Static constructor function.
* Prototype-modifiable field initialization.
* Abstract and Final classes.
* Supports HTML Custom Elements.
* Targetable `super` accessor.
* Constructor reference on the instance.

---

## How To Use
There's 2 different ways you can use ClassicJS:

1. As a base class:
```js
import Classic from "classicjs";
// or
// const Classic = require("classic.js");
const { STATIC, PRIVATE, PROTECTED, PUBLIC, CLASSNAME } = Classic;

const Ex = Classic({
    [CLASSNAME]: "Ex",
    [PRIVATE]: {
        foo: "foo"
    },
    [PROTECTED]: {
        bar: "bar"
    },
    [PUBLIC]: {
        foobar: "foobar",
        print() {
            console.log(`this.foo = ${this.$foo}`);     //private
            console.log(`this.foo = ${this.$bar}`);     //protected (essentially private)
            console.log(`this.foo = ${this.foobar}`);   //public
        }
    },
    [STATIC]: {
        [PRIVATE]: {
            fubar: "fubar"
        },
        [PROTECTED]: {
            [42]: "What is the meaning of life, the universe, and everything?"
        },
        [PUBLIC]: {
            constructor() {
                console.log("The most useful item in the universe: a bath towel.");
            }
        }
    }
});
```

Did you notice the calculated property names? I decided that I didn't want to shorten your available namespace for your properties even by 4 words. Those Symbols are how you define each section. This also helps decrease the risk of a typographical error as it's that much easier for tooling to find any mistake. However, if you don't mind using those 4 words directly for structure, you can always do it like this:

```js
import Classic from "classicjs";
// or
// const Classic = require("classic.js");
Classic.UseStrings = true;      //Turn on support for string section names

const Ex = Classic({
    className: "Ex",
    private: {
        foo: "foo"
    },
    protected: {
        bar: "bar"
    },
    public: {
        foobar: "foobar",
        print() {
            console.log(`this.foo = ${this.$foo}`);     //private
            console.log(`this.foo = ${this.$bar}`);     //protected (essentially private)
            console.log(`this.foo = ${this.foobar}`);   //public
        }
    },
    static: {
        private: {
            fubar: "fubar"
        },
        protected: {
            [42]: "What is the meaning of life, the universe, and everything?"
        },
        public: {
            constructor() {
                console.log("The most useful item in the universe: a bath towel.");
            }
        }
    }
});
```
In the example above, you probably noticed the use of `$` as the private access specifier. In deference to the long standing convention of using `_` for such a purpose, you can use that too. To do so, just add one line to your code:

```js
...
//Turn on support for string section names
Classic.UseStrings = true;
//Use underscore for private & protected access
Classic.PrivateAccessSpecifier = '_';
...
```
Currently, `Classic.PrivateAccessSpecifier` only accepts `_` & `$`. While it's possible to make it work without a private access specifier, that would require a lot more code to validate the class definition. It would no longer be viable to allow public members to have the same name as their private/protected counterparts.

2. As a derived class
```js
const Ex2 = Classic(Ex, {
    className: "Ex2",
    [PRIVATE]: {
        foo: "fu"
    },
    [PUBLIC]: {
        constructor() {
            this.super();               //Replacement for the ES6 super(). Equally as required!
        },
        print() {
            console.log(`this.foo = ${this.$foo}`);     //private
            console.log(`this.foo = ${this.$bar}`);     //protected (essentially private)
            console.log(`this.foo = ${this.foobar}`);   //public
        }
    }
});
```

As you would expect, `private` members are not shared or exposed, and `protected` members are not exposed. In fact, the result of creating a new instance of a ClassicJS class is a seemingly normal object. It is not a Proxy, and that's precisely what allows ClassicJS classes to be used in creating HTML Custom Elements, extending native objects, and even interoperating (somewhat) with objects containing the new private fields. 

That being said, I would strongly suggest not trying to mix private fields into ClassicJS classes. They just won't work. While `new` returns a seemingly normal object, calling any function on that object turns `this` into a Proxy. ClassicJS class instance objects are essentially inverse membranes. Where a membrane uses a pair of Proxies to share the details of an instance, this inverse membrane exposes an instance to hide the details of a pair of Proxies. Fun right?

Another thing that just won't work is `super()`. Sadly, it's tied to the constructor function of `class`. As a replacement, ClassicJS provides `this.super()`. It has almost exactly the same functionality as `super()`. If you extend a base class without calling this function, you will not be able to use `this` to access anything in the class! Of course, if you don't specify a base class, or don't specify a constructor function, then calling `this.super()` is completely unnecessary and will be handled for you.

---
## The `Classic` Function
The features of ClassicJS are exposed through the `Classic` function. The primary job of `Classic` is to create new class constructors and prototypes, along with the additional plumbing required to support private and protected members. `Classic` has 2 arguments.

### First Argument: **base**, optional

This is the base class you're extending. Much like the `extends` clause in a `class` statement, you only need to specify it if you intend to extend a class. The following is to show you the difference between ES6 `class` and Classic:

```js
//ES6 anonymous class
let anonymous_es6 = class {...}

//Classic anonymous class
let anonymous_classic = Classic({...});
//------------------------------------------
//ES6 base class
class Ex_ES6{...}

//Classic base class
const Ex_Classic = Classic({
    className: "Ex_Classic",
    ...
});
//------------------------------------------
//ES6 derived class
class Ex2 extends Ex {...}

//Classic derived class
const Ex2_Classic = Classic(Ex, {
    className: "Ex2_Classic",
    ...
});
```

Is it more typing? Yup, but as it should be, more boilerplate comes with more flexibility. ClassicJS gives you several features that can't easily be done using `class`.

### Second Argument: **data**, required

This is the class definition. It's structure is as follows:

```js
{
    [Classic.CLASSNAME]: String, optional,
    [Classic.INHERITMODE]: Symbol, optional, //One of [Classic.ABSTRACT, Classic.FINAL]
    [Classic.PRIVATE]: Object, optional,
    [Classic.PROTECTED]: Object, optional,
    [Classic.PUBLIC]: Object, optional,
    [Classic.STATIC]: { // Object, optional,
        [Classic.PRIVATE]: Object, optional,
        [Classic.PROTECTED]: Object, optional,
        [Classic.PUBLIC]: Object, optional,
    }
}
```
If you add anything to this structure, it will be ignored. In general, you can use anything that contains some combination of the above properties as the class definition. Classic processes those fields and makes a copy of its own. You're free to manipulate the structure afterward without fear of interfering with the resulting class. Since the definition is a plain old Javascript object, there is no way to use the `static` keyword within the definition. As such, all static members should be placed in the appropriate part of the `Classic.STATIC` object.

---

## `Classic`'s static members 
The `Classic` function has a small API attached to it. This API provides configuration options to control the behavior of `Classic`, constants to assist in normalizing the names of the declaration key properties, and methods to help dodge well-known footguns involving prototypes.

### Configuration
* **PrivateAccessSpecifier** - Sets the Identifier character reserved for use to access non-public members. Can be either `$` or `_`. Default is '$'.
* **UseStrings** - Use to specify whether string keys or Symbol keys will be the values for the access modifier constants below.

### Constants
* **CLASSNAME** - Used to specify the name of the class. Omit to create an anonymous class
* **INHERITMODE** - Used to declare your class as `abstract` or `final`.
* **ABSTRACT** - Used to declare that the class cannot be directly instantiated and must be extended.
* **FINAL** - Used to declare that the class cannot be extended.
* **STATIC** - Used to define members that are part of the constructor as opposed to an instance.
* **PRIVATE** - Used to define members that cannot be accessed outside of the owning object's type.
* **PROTECTED** - Used to define members that cannot be publicly accessed, but are still accessible by the owning object's type and any descendants of that type.
* **PUBLIC** - Used to define members of the public prototype.
* **PLACEHOLDER** - Used to identify prototype elements that are placeholders for initialization functions.
* **CLASS** - Used to retrieve the constructor of the current instance.

### Methods
* **init** - Used to set an initializer function on the prototype to add an instance-specific value to a property.
* **getInitValue** - Retrieves a copy of the instance-specific value for a property.

---

## Classic Features
As mentioned before, there are a few features of ClassicJS that don't exist with ES6 classes.

### Abstract & Final Inheritance Modes
These are just as you'd expect in any class-based language that supports them.

```js
const Ex = Classic({
    [Classic.INHERITMODE]: Classic.ABSTRACT, //Could also be Classic.FINAL
    ...
})

//or
Classic.UseStrings = true

const Ex = Classic({
    inheritMode: "abstract",    //Could also be "final"
    ...
})
```

### Static Constructor
Suppose you needed to initalize something as soon as this class exists. The static constructor is your first chance to do this. By embedding your initialization logic in the static constructor, you can be absolutely certain that this initialization takes place before any other code has had a chance to manipulate the class. Inside the constructor function, `this` is the class constructor. The static constructor cannot take arguments.

```js
const Ex = Classic({
    ...
    [Classic.STATIC]: {
        constructor() {
            //Do something interesting!
        }
    }
    ...
})

```

### Targetable `super()`
In ES6, `class` constructor functions use `super` to access the base class's methods. However, that's fairly limited. There's no convenience tool for accessing any ancestors beyond the immediate parent `class`. A ClassicJS class, can also make use of the built-in `super` accessor. However, it has the exact same limitations. To alleviate this, Classic includes `this.super()` to serve the same purpose. The difference is that `this.super()` takes 1 optional argument: an ancestor class or it's name. This means, even if you only know the name of the ancestor class (assuming all the ancestor class names are unique), you can even call a function from an ancestor that was overridden by a later ancestor without resorting to manually digging through the prototype chain to find it.

```js
Classic.UseStrings = true;
const Ex1 = Classic({
    className: "Ex1",
    public: {
        someFunc() { console.log("Ex1::someFunc"); }
    }
})

const Ex2 = Classic({
    className: "Ex2",
    public: {
        someFunc() { console.log(`Ex2::someFunc overrides ${super.someFunc()}`); }
    }
})

const Ex3 = Classic({
    className: "Ex3",
    public: {
        someFunc() { console.log(`Ex3::someFunc overrides Ex2::someFunc and retrieves ${this.super("Ex1").someFunc()}`); }
    }
})
```


### Prototype-modifiable Field Initialization
ClassicJS takes full advantage of the fact that JavaScript is prototype-based. So all public members are prototype members. The only problem with this is the unfortunate footgun that can happen when one initializes a prototype member with an object in the class definition. All instance of the class will share that copy of the object. This has been known to cause fairly costly issues for some developers.

To get around this problem, there is a helper function: `Classic.init()`. This function takes a function as a parameter, and queue's it to be called when a class instance is created. In this way, your prototype-based object property is effectively initialized to the value your function returns.

```js
const {init} = Classic;
Classic.UseStrings = true;
const Ex = Classic({
    private: {
        someObj: init(()=>({...}))
    },
    public: {
        someObj2: init(()=>{
            ...
            return ...;
        })
    }
})
```

It must be understood that the private and protected sections of the class definition define a "private prototype" that is used to create the private context of an instance. As such, object properties of the private context must also be initialized using `Classic.init()`.

Since using `Classic.init()` does not call the function parameter until an instance is created, ClassicJS initializes the prototype property with a unique, frozen object with a single property of `undefined` value: `Classic.PLACEHOLDER`. This object is used to identify the property as being in need of initialization. Since the object is both unique and readily identifiable, it's possible to replace the initializer function for any public property.

```js
const {init} = Classic;
Classic.UseStrings = true;
const Ex = Classic({
    private: {
        someObj: init(()=>({...}))
    },
    public: {
        someObj2: init(()=>{
            ...
            return ...;
        })
    }
})

if (Classic.getInitValue(Ex.prototype.someObj2)) {
    Ex.prototype.someObj2 = init(someFn);
}
```
It must be noted that it is **not possible** to replace the initializer for private and protected members. Their prototypes are not publicly exposed, so there's simply no way to access them after the class definition has been processed.

`Classic.getInitValue()` is used to check if a property has a placeholder object. If it does, this function returns the function associated with that placeholder object. In this way, it is always possible to replace the initialization functions for members on the prototype. As long as all initialization objects are managed using `Classic.init()` & `Classic.getInitValue()`, there will be no issues with the object-on-the-prototype footgun.

**Note:** Do not use `Classic.init()` on static members. Such initializers will never be run.

**Note:** While the initializer functions do have access to `this`, they do not have access to the private and protected members of the class. This is due to the fact that they are potentially external to the class definition and definitively replaceable. Even if the replaceablility were to be removed, the fact that `Classic` has no way of determining whether or not the initialization function was external or declared inline in the definition means that all such functions must be viewed as external. This is also true for the initializers on private and protected members. Any initialization that requires access to private or protected data should be done in the constructor.

### Constructor reference on the instance.
Did you ever wish there was a simple, guaranteed way of referencing the class constructor without relying on the prototype, or requiring the class to have a name? With ClassicJS, it's as simple as:

```js
//Ex is any one of the examples above
let a = new Ex();
let ctor = a[Classic.CLASS];
//or if Classic.UseStrings == true
ctor = a.cla$$;
```

I decided to use those "$" for the same reason as creating the Symbol key names. Plus, it's enough of a visual break to let you know that this is not a normal member of your class. With this, even if someone deletes the constructor from your prototype, and your class is anonymous, as long as you have an instance, you have access to the constructor.

### Constructor `this` value
The constructor function of a class is a black box controlled by the JS engine. As such, there is no way to directly alter the value of `this` in a constructor after it is running. I needed to get around this problem to allow for `this.super()` as well as to stage the private and protected object properties during object construction. This meant setting up `this` as a proxy object before calling the user constructor.

If you have operations not a part of the class that will need to see the real value of `this` instead of the proxy, there is `Classic.getInstance()`. Given the `this` value as a parameter, it will return the actual instance value that will be returned from the constructor. With this, you can even set up your own Map, or pass around the real value of `this` from the constructor and be assured that later access by member functions of this class will work correctly.

## Debugger Noise
ClassicJS uses `eval()` in a few places to ensure that the wrapper functions is uses to hide its internal proxies still give you the function names you expect in the debugger. However, as a result, there's code you probably don't care about that will show up between a member function call and the actual member function. Since I found this annoying, I added a sourceUrl line to the bottom of each `eval()` code block. This puts all generated code under "/ClassicJSGenerated" in your source tree while running. This means that in debug tools that support ignoring frameworks (like Chrome debugger), you can add "/ClassicJSGenerated/.*\\.js$" to the ignore list and never have to worry about seeing any of the generated code. If you also add "/Classic.\\.js$", then you won't have to step through any of this library's code and debug just your work as if it were native functionality. Enjoy!