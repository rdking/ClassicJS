# ClassicJS-Fast

This version of ClassicJS is nearly identical to the other save for 1 major detail: this version uses Proxy only to manage instance construction. Other than that, there are no Proxys anywhere! This reduces the overhead penalty paid in the other version to simplify the syntax. At the same time, the cost of the speed increase is needing an extra `.` in the references. 

For instance, if given this code using ClassicJS:
```js
import Classic from "classicjs/fast";
// or
// const Classic = require("classicjs/fast");
Classic.UseStrings = true

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
            console.log(`this.foo = ${this.$foo}`);    //private
            console.log(`this.bar = ${this.$bar}`);    //protected (essentially private)
            console.log(`this.foobar = ${this.foobar}`);   //public
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

It would look like this using ClassicJS/fast:

```js
import Classic from "classicjs/fast";
// or
// const Classic = require("classicjs/fast");
Classic.UseStrings = true

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
            console.log(`this.foo = ${this.$.foo}`);    //private
            console.log(`this.bar = ${this.$.bar}`);    //protected (essentially private)
            console.log(`this.foobar = ${this.foobar}`);   //public
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

You can still use either `$` or `_` as the private accessor. However, since most of the Proxy objects created by the hard version have been removed in this version, the private accessor returns an object. That object contains an accessor for every private and protected property accessible via this instance.

Despite the existence of this exposable interface, none of the accessors will function outside of a member of the class that was present at the time of declaration. In this way, private and protected data are not made public. Likewise, access to the private accessor object is similarly non-public even though the property is exposed publicly.

For those who projects which value security over speed and need to ensure that private and protected member names can never be exposed, the "hard" version should be used. However, if speed is a priority, and it is not acceptable to pay Proxy penalties for each call and member access, the "fast" version should be used.
