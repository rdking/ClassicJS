# ClassicJS
This is a library designed to provide fully privileged member support to ES6 classes. ClassicJS is little more than a wrapper function. However, unlike the great many other wrapper functions out there, this one doesn't focus on wrapping the target class. You can choose to wrap a new target class, an existing base class, or even no class at all. All you really need is a prototype object. ClassicJS will generate a class for you from that.

## Features
* Private & Protected members on instances, even when Proxy-wrapped.
* Private static & Protected Static members on Classic constructors.
* Static constructor function.
* Prototype-modifiable field initialization.
* Abstract and Final classes.
* Supports HTML Custom Elements.
* Targetable `super` accessor.

---

## How To Use
There's 2 different ways you can use ClassicJS:

1. As a base class:
```js
import Classic from "classicjs";
// or
// const Classic = require("classic.js");
const { STATIC, PRIVATE, PROTECTED, PUBLIC, CLASSNAME } = Classic;

class Ex extends Classic({
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

class Ex extends Classic({
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
Classic.UseStrings = true;              //Turn on support for string section names
Classic.PrivateAccessSpecifier = '_';   //Use underscore for private & protected access
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

As you would expect, `private` members are not shared or exposed, and `protected` members are not exposed. In fact, the result of creating a new instance of a ClassicJS class is a seemingly normal object. It is not a Proxy, and that's precisely what allows ClassicJS classes to be used in creating HTML Custom Elements, extending native objects, and even interoperating (somewhat) with objects containing the new private fields. That being said, I would strongly suggest not trying to mix private fields into ClassicJS classes. They just won't work. While `new` returns a seemingly normal object, calling any function on that object turns `this` into a Proxy. ClassicJS class instance objects are essentially inverse membranes. Where a membrane uses a pair of Proxies to share the details of an instance, this inverse membrane exposes an instance to hide the details of a pair of Proxies. Fun right?

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

Is it more typing? Yup, but as it should be, more boilerplate comes with more flexibility. Unlike ES6 `class` you also get several features that can't easily be done using `class`.

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
* **PLACEHOLDER** - Used to identify prototype elements that are placeholders for initialization functions.

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
    [Classic.INHERITMODE]: Classic.ABSTRACT,
    ...
})

//or
Classic.UseStrings = true

const Ex = Classic({
    inheritMode: "abstract",
    ...
})
```

### Static Constructor
Suppose you needed to initalize some private static data in a `class` that depended on other factors. The static constructor is the perfect place to do this

### Targetable `super()`


### Prototype-modifiable Field Initialization



The object you pass to `Classic` will be used to create a prototype for the new class. So you can think of it effectively as the prototype. However, the actual prototype produced will not be assignment compatible with this object. With the change of a boolean option, the keys used for the prototype object can switch between being a symbol or the more common strings (`PRIVATE === "private"`). All keys are optional, but you can only place properties under these keys. ClassicJS throws an error if it finds an out-of-place entry.
