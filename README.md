# ClassicJS
This is a library designed to provide fully privileged member support to ES6 classes. ClassicJS is little more than a wrapper function. However, unlike the great many other wrapper functions out there, this one doesn't focus on wrapping the target class. You can choose to wrap a new target class, an existing base class, or even no class at all. All you really need is a prototype object. ClassicJS will generate a class for you from that.

## Features
* Full support for private members, even when Proxy-wrapped.
* Full support for protected members.
* Full support for private static members.
* Full support for protected static members.
* Full support for prototype-modifiable field initialization.

## How To Use
There's 2 different ways you can use ClassicJS:

1. As a base class:
```js
import Classic from "classicjs";
// or
// const Classic = require("classic.js");
const { STATIC, PRIVATE, PROTECTED, PUBLIC } = Classic;

class Ex extends Classic({
    [PRIVATE]: {
        foo: "foo"
    },
    [PROTECTED]: {
        bar: "bar"
    },
    [PUBLIC]: {
        foobar: "foobar"
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

Did you notice the calculated property names? I decided that I didn't want to shorten your available namespace for your properties even by 4 words. Those Symbols are how you define each section. This also helps decrease the risk of a typographical error as it's that much easier for tooling to find any mistake.

2. As a class of it's own:
```js
const Ex2 = Classic({
    [PRIVATE]: {
        foo: "foo"
    },
    [PROTECTED]: {
        bar: "bar"
    },
    [PUBLIC]: {
        foobar: "foobar"
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

If you want to extend another `class`, constructor `function`, or native type, just specify it as the first parameter, followed by your prototype.
```js
const Ex3 = Classic(String, {...});
```

### Structure:
Normally, when using ES6 classes, every instance created looks something like this:

```js
{ //instance object
    data_property: value,
    __proto__: prototype_chain
}
```
and the nature of the instance object is decided by the initial ancestor. This works out great for extending native objects since native methods sometimes need to receive the native instance in order to function. However, this can also sometimes cause problems, as an ancestor is free to do anything it likes to an object, some of which may interfere with the functionality of descendant classes.

With ClassicJS, things work a little differently. In an attempt to emulate the nature of classes in compiled languages, ClassicJS builds a class that looks more like this:

```js
{ //instance object
    descendant_property: value,
    __proto__: { //ancestor instance object
        ancestor_property: value
        __proto__: prototype_chain
    }
}
```

Given the usual copy-on-write behavior of prototypes, this must seem like a curious thing do to. Well, remember when I spoke about the requirements of native class functions? Doing things this way allows us to gain 3 important behaviors, 2 of which solve the native class object problem:

1. _**Class-Specific Instancing**_ - This behavior causes any call through an instance object to a lexically declared function on one of the prototype objects to receive as `this` the ancestor instance object created by the class corresponding to the prototype object.

If you're scratching your head about what this means, let's say you had the following code:
```js
const Base = Classic({
    [PUBLIC]: {
        data: "apple"
        bump(instance) {
            console.log(`this.data = ${this.data}`);
            console.log(`instance.data = ${instance.data}`);
        }
    }
});

const Derived = Classic(Base, {
    [PUBLIC]: {
        data: "orange",
        change() {
            delete this.data;
            this.bump(this);
            this.data = "orange";
            this.bump(this);
        }
    }
});

let d = new Derived();
d.bump(d);
d.change();
```
If you were to run this, you'd see:
```
this.data = apple
instance.data = orange
this.data = apple
instance.data = apple
this.data = orange
instance.data = orange
```
What happened here is that each time `bump()` is called, the `this` that it received is actually the ancestor instance created by `Base`. That's why `this.data = apple` for the first 2 calls. The other interesting point is that when `this.data = "orange";` was encountered, since `this.hasOwnProperty("data")` was false, the ancestor object received the request. If no ancestor object contained a `data` element, then the derived instance would have directly received the request. Put simply, ancestor objects interfere with copy-on-write behavior to ensure that data stays on the correct instance object, and the correct instance object is always received by any function that was a part of the prototype chain during the lexical declaration of the class.

2. _**Data Isolation**_ - This is something completely new. This behavior persistently assigns property changes to the ancestor instance of the current instance that contains the nearest definition for the property.

This means that if a property key already exists, changes will be directly assigned to the owning ancestor instance instead of creating a new value on the topmost instance. While peculiar in ES, this feature allows class instances to work properly under all circumstances without any suprising side effects on class inheritance.

3. _**Initializer Changes Via The Prototype**_ - This feature preserves the notion of being able to change the prototype to alter the default values that will be associated with each instance.

Take the following code for example:
```js
import Classic from "classicjs";
const { STATIC, PRIVATE, PROTECTED, PUBLIC, 
        PLACEHOLDER, init=INIT, getInitValue } = Classic;

const Ex = Classic({
    obj: INIT(() => ({ a: 1 }));
});
```
When instantiated, you'll get an instance of `Ex` with a single property `obj` having a unique copy of an object matching `{ a: 1 }`. Every new instance will receive its own copy. However, if you looked at `Ex.prototype.obj`, all you'd find is a non-extensible object that looks like `{}`. That object can be recognized via the 1 property it has: namely `PLACEHOLDER in Ex.prototype.obj === true`. 

With this, you can identify which prototype properties have initializers. If you want a copy of the data that might get stored on an instance, you can do this:
```js
getInitValue(Ex.prototype.obj);
```
Note that this will be a unique instance of the data. To change the initializer that is used, just use `Classic.init` as was done to create the initializer:
```js
Ex.prototype.obj = INIT(() => { a: 42 });
```
The change will take effect on the next fetch of the initial value. Each new instance created after this will receive an instance copy of the new object.

### Foot-gun Avoidance:
I know, you don't want to use something like this because of the foot-gun of objects on the prototype, right? Don't worry. I covered that case too! I added 1 more API just to make this task easier and clear. Take a look:

```js

const Ex = Classic({
    [PRIVATE]: {
        object: Classic.init(() => ({ random: ~~(Math.random() * 1000) }))
    },
    [PUBLIC]: {
        constructor() {
            console.log(`(private this).object = ${JSON.stringify(this.$object, null, '  ')}`);
        }
    }
});
```

`Classic.init` registers the function you pass it as an initializer for the property. When the class is instantiated, all such initializers are run to generate the value that will go on the class-specific instance. With this, you can kiss those foot-guns goodbye.

## API

### Configuration
* **PrivateAccessSpecifier** - Sets the Identifier character reserved for use to access non-public members. Can be either `$` or `_`. Default is '$'.
* **UseStrings** - Use to specify whether string keys or Symbol keys will be the values for the access modifier constants below.

### Constants
* **STATIC** - Used to define members that are part of the constructor as opposed to an instance.
* **PRIVATE** - Used to define members that cannot be accessed outside of the owning object's type.
* **PROTECTED** - Used to define members that cannot be publicly accessed, but are still accessible by the owning object's type and any descendants of that type.
* **PLACEHOLDER** - Used to identify prototype elements that are placeholders for initialization functions.

### Methods
* **init** - Used to set an initializer function on the prototype to add an instance-specific value to a property.
* **getInitValue** - Retrieves a copy of the instance-specific value for a property.
