/**
 * @typedef DataSpec
 * @property {Object} private - The prototype of the private data object for
 * each class instance.
 * @property {Object} protected - The object containing the prototype definition
 * of properties to be shared with subclasses.
 * @property {Object} public - The prototype of the public data object for each
 * class instance.
 */

class Stack extends Array {
    peek() { return this[this.length - 1]; }
}

let useStrings = false;
let TRIGGER = '$';

const owners = new WeakMap;     //Owning class TYPEID for each registered function
const pvt = new WeakMap;        //Private data for each instance
const protMap = new WeakMap;    //Inheritable objects from each class
const types = new WeakMap;      //Map of constructors and their TYPEIDs
const initFns = new WeakMap;    //Map of initialization functions
const protNameMap = new WeakMap;//Name mapping for the protected members
const stack = new Stack;        //Function registration used to validate access
const TARGET = Symbol("Proxy Target"); //Used to retrieve the target from the proxy
const UNUSED = Symbol();        //Used to ensure that a property isn't found.
const SUPER_CALLED = Symbol()   //Used to enable normal use of `this`.

/**
 * Generates a stupidly long sequence of random numbers that is likely to never
 * appear as a function name for use as a function name that can be identified
 * in a stack trace. This allows the handler logic to definitively identify
 * whether or not the calling function has private access.
 */
function makeFnName() { 
    function getBigRandom() { return parseInt(Math.random()*Number.MAX_SAFE_INTEGER); }
    return `_$${getBigRandom()}${getBigRandom()}${getBigRandom()}${getBigRandom()}$_`;
}

 /**
  * Converts the protected prototype into a set of accessors that shadow
  * themselves on first write with the written data.
  * @param {Object} protData - The protected container to convert to accessors.
  * @param {Object} pvtData - The target private container to access.
  * @returns {Object} - An accessor-only version of the prototype data
  */
function toAccessors(protData, pvtData) {
    let retval = {};
    let keys = Object.getOwnPropertyNames(protData).concat(Object.getOwnPropertySymbols(protData));

    for (let key of keys) {
        Object.defineProperty(retval, key, {
            get() { return pvtData[key]; },
            set(v) {
                Object.defineProperty(this, key, { 
                    writable: true,
                    value: v 
                });
            }
        });
    }
    return retval;
}

/**
 * Searches the prototype chain for an object containing the given TYPEID
 * @param {Symbol} TYPEID - ID of the targeted class
 * @param {Object} target - instance who's identifying object must be found
 * @returns {Object} - The target idObject or null if not found
 */
function getIdObject(TYPEID, target) {
    let retval = target
    while (retval && !retval.hasOwnProperty(TYPEID)) {
        retval = Object.getPrototypeOf(retval);
    }
    return retval;
}

/**
 * Searches the prototype chain for an object containing the given property. If
 * the property is not found before reaching the topmost prototype object, the
 * original target is used as the default value.
 * @param {string|Symbol} prop - key of the property we expect
 * @param {Object} target - instance object who's prototypes will be searched
 * @returns {Object} - the found object, or target if no object was found.
 */
function getIdObjectWithProp(prop, target) {
    let retval = Object.getPrototypeOf(target);

    while (retval && !(pvt.has(retval) && retval.hasOwnProperty(prop))) {
        retval = Object.getPrototypeOf(retval);
    }

    return retval || target;
}

/**
 * Wraps fn with a uniquely identifiable function that ensures privileged
 * member functions can be identified.
 * @param {function} fn - Target function to wrap
 * @param {Symbol} TYPEID - Unique ID of the class owning fn
 * @returns {function} - uniquely named wrapper function
 */
function makePvtName(fn, TYPEID) {
    let name = makeFnName();
    let retval = eval(`(function ${name}(...args) {
        stack.push(${name});
        let retval = fn.apply(this, args); 
        stack.pop();
        return retval;
    })`);

    Object.defineProperties(retval, {
        toString: {
            configurable: true, 
            writable: true,
            value: Function.prototype.toString.bind(fn)
        },
        length: {
            configurable: true,
            value: fn.length
        }
    });

    owners.set(retval, TYPEID);
    return retval;
}

/**
 * Generates a copy of data where the protected object only contains accessors
 * back to the private data. All the actual properties are moved to the private
 * prototype object.
 * @param {DataSpec} data - The object containing the public data and non-public
 * members of the target class.
 * @param {WeakMap} stack - Map of all the instance stacks
 * @param {Symbol} TYPEID - ID of the targeted class
 * @returns {Object} - Returns a processed version of the prototype object.
 */
function convertPrivates(data, stack, TYPEID) {
    let pvt = {},
        staticPvt = {},
        pub = {},
        staticPub = {};

    function convert(dest, src) {
        let keys = Object.getOwnPropertyNames(src).concat(
            Object.getOwnPropertySymbols(src)
        );

        for (let key of keys) {
            let desc = Object.getOwnPropertyDescriptor(src, key);

            if (key in dest) {
                Object.assign(desc, Object.getOwnPropertyDescriptor(dest, key));
            }

            if ("value" in desc) {
                if (typeof(desc.value) === "function") {
                    desc.value = makePvtName(desc.value, TYPEID);
                }
            }
            else {
                if (("get" in desc) && desc.get) {
                    desc.get = makePvtName(desc.get, TYPEID);
                }
                if (("set" in desc) && desc.set) {
                    desc.set = makePvtName(desc.set, TYPEID);
                }
            }
            Object.defineProperty(dest, key, desc);
        }
    }
    
    //Sanity check. Are there unwanted keys?
    function findOrphans(obj, isStatic) {
        let keyset = new Set(Object.getOwnPropertyNames(obj).concat(
            Object.getOwnPropertySymbols(obj)
        ));
        keyset.delete(Classic.PRIVATE);
        keyset.delete(Classic.PROTECTED);
        keyset.delete(Classic.PUBLIC);
        !isStatic && keyset.delete(Classic.STATIC);
    
        if (keyset.size > 0) {
            throw new SyntaxError(`Found orphan ${isStatic?"static ":""}keys: ${Array.from(keyset)}`);
        }    
    }
    findOrphans(data);
    findOrphans(data[Classic.STATIC], true);

    for (let src of [data[Classic.PRIVATE], data[Classic.PROTECTED]]) {
        convert(pvt, src);
    }
    convert(pub, data[Classic.PUBLIC]);

    for (let src of [data[Classic.STATIC][Classic.PRIVATE], data[Classic.STATIC][Classic.PROTECTED]]) {
        convert(staticPvt, src);
    }
    convert(staticPub, data[Classic.STATIC][Classic.PUBLIC]);

    return {
        //If it's not public, it's private...
        [Classic.PRIVATE]: pvt,
        // but, if it's protected, it can be shared.
        [Classic.PROTECTED]: toAccessors(data[Classic.PROTECTED], data[Classic.PRIVATE]),
        [Classic.PUBLIC]: pub,
        [Classic.STATIC]: {
            [Classic.PRIVATE]: staticPvt,
            [Classic.PROTECTED]: toAccessors(data[Classic.STATIC][Classic.PROTECTED], data[Classic.STATIC][Classic.PRIVATE]),
            [Classic.PUBLIC]: staticPub,
        }
    };
}

/**
 * Searches for the inheritance owed the current class in construction based
 * on the prototype of the base class.
 * @param {Object} obj - top of the prototype chain to search for an object
 * with protected properties.
 * @returns {Object} containing protected properties and a map of the class-specific names.
 */
function getInheritance(obj, TYPEID) {
    while (obj && (!protMap.has(obj) || obj.hasOwnProperty(TYPEID))) {
        obj = Object.getPrototypeOf(obj);
    }

    if (obj) {
        let retval = {
            map: {},
            data: {}
        };
        let prot = protMap.get(obj);
        let keys = Object.getOwnPropertyNames(prot).concat(
            Object.getOwnPropertySymbols(prot)
        );

        for (let key of keys) {
            let name = Symbol(key.toString());
            Object.defineProperty(retval.data, name, Object.getOwnPropertyDescriptor(prot, key));
            retval.map[key] = name;
        }

        return retval;
    }
}

/**
 * Checks the manual and engine call stacks to verify that the currently
 * executing function has the right to access private members.
 * @param {Stack} stack - Stack of registered private member functions in this
 * class that are being executed.
 * @param {Number} offset - Count of extra functions in the call stack.
 * @returns {Symbol?} - The TYPEID for the function that's running or undefined.
 */
function validateAccess(stack, offset) {
    let eStack = (new Error).stack.split(/\n/);
    let fn = stack.peek();

    //V8 adds an error-type line in the stack trace.
    if (eStack[0] === "Error")
        eStack.shift();

    if (!eStack[3 + offset].includes(fn.name))
        throw new SyntaxError(`Invalid private access specifier encountered.`);

    return owners.get(fn);
}

/**
 * Checks to see if the passed function is a native function. It's more of a
 * quick guess than a certainty, but it's good enough to avoid getting fooled
 * by the average "bind" usage.
 * @param {function} fn - Any function.
 * @returns {boolean}
 */
function isNative(fn) {
    return (typeof(fn) === "function") &&
           fn.hasOwnProperty("prototype") &&
           fn.toString().includes("[native code]");
}
/**
 * The super constructor-calling function.
 * @param {Object} memberProto - Prototype of the child class to be initialized
 * onto the instance's idProto.
 * @param {*} inst - The instance object for the class being constructed
 * @param {*} base - The superclass that needs to be initialized
 * @param  {...any} args - Arguments to the superclass constructor
 * @returns {any} - the result of initializing the superclass
 */
function Super(memberProto, inst, base, ...args) {
    let idProto = Object.getPrototypeOf(inst);
    let newTarget = function() {},
        proto = Object.getPrototypeOf(idProto);
        pvtData = pvt.get(idProto) || {};
    if (inst && inst.constructor && (proto === inst.constructor.prototype)) {
        newTarget = inst.constructor;
    }
    else {
        newTarget.prototype = proto;
    }
    
    let newInst = Reflect.construct(base, args, newTarget);
    Object.setPrototypeOf(idProto, newInst);
    if (Object.isExtensible(newInst) && types.has(base)) {
        let typeId = types.get(base);
        if (!newInst.hasOwnProperty(typeId)) {
            Object.defineProperty(newInst, typeId, { value: void 0 });
            if (!pvt.has(newInst))
                pvt.set(newInst, Object.seal({}));
        }
    }
    runInitializers(idProto, memberProto);
    runInitializers(pvtData, Object.getPrototypeOf(pvtData));
    return inst;
}

/**
 * Validates the data object and ensures that it meets the minimum requirements
 * to keep from causing errors in this code. Also ensures that private member
 * functions are called with an appropriate context object.
 * @param {Object} data - The data to be adjusted. 
 */
function fixupData(data) {
    let a = new Set([Classic.STATIC, Classic.PRIVATE, Classic.PROTECTED, Classic.PUBLIC]);
    a.forEach((entry) => {
        if (data.hasOwnProperty(entry)) {
            let item = data[entry];
            if (item && (typeof(item) !== "object"))
                throw new TypeError(`Expected property "data.${entry}" to be an object.`);
        }
        else {
            data[entry] = {};
        }
    });

    a.delete(Classic.STATIC);
    a.forEach((entry) => {
        if (data[Classic.STATIC].hasOwnProperty(entry)) {
            let item = data[Classic.STATIC][entry];
            if (item && (typeof(item) !== "object"))
                throw new TypeError(`Expected property "data[Classic.STATIC].${entry}" to be an object.`);
        }
        else {
            data[Classic.STATIC][entry] = {};
        }
    });
}

/**
 * Finds and runs all initializers associated with the prototype. It stores the
 * returned values on the instance object.
 * @param {Object} inst - the object to run initializers against
 * @param {Object} mProto - the prototype containing properties with values
 * that are initializer keys
 */
function runInitializers(inst, mProto) {
    let keys = Object.getOwnPropertyNames(mProto).concat(
        Object.getOwnPropertySymbols(mProto)
    );
    let isID = pvt.has(inst);

    for (let key of keys) {
        if (initFns.has(mProto[key])) {
            inst[key] = initFns.get(mProto[key]).call(this);
        }
        else if (isID && (typeof(mProto[key]) !== "function")) {
            inst[key] = mProto[key];
        }
    }
}

/**
 * Produces an extendable function to be used as the base class for another
 * class. This allows a new class to contain prototype-based data while also
 * maintaining privilege levels that work properly even inside a Proxy.
 * @param {function?} base - Base class constructor to used. Defaults to Object.
 * @param {DataSpec} data - Object describing the data that will exist on the
 * prototype and it's corresponding privileges.
 * @returns {function} - The constructor for the newly defined class. 
 * 
 * @property {string} PrivateAccessSpecifier - Used to set the identifier
 * character that is used to access non-public members. Can be either '$' or
 * '_'. Defaults to '$'.
 * @property {boolean} UseStrings - If set to true, the data parameter can use
 * the strings "public", "protected", "private", & "static" to define the
 * sections instead of their symbolic counterparts. Defaults to false.
 * @property {function} init - Used to defer property assignment until an
 * instance is created. Causes each instance to receive a unique copy unless
 * the function is crafted to return the same value each call.
 * @property {function} getInitValue - Used to retrieve an initialization value
 * for a prototype property that was initialized with `Classic.init`.
 * @property {Symbol} PLACEHOLDER - Used to identify prototype properties that
 * were created with `Classic.init` and can be used with `Classic.getInitValue`.
 * @property {Symbol|string} STATIC - Used to specify properties belonging to
 * the constructor function. Can only contain the other 3 section constants.
 * @property {Symbol|string} PRIVATE - Used to specify properties that will only
 * be accessible by the declaring class.
 * @property {Symbol|string} PROTECTED - Used to specify properties that will be
 * accessible to the declaring class and its descendants.
 * @property {Symbol|string} PUBLIC - Used to specify properties that will be
 * openly accessible.
 */
function Classic(base, data) {
    switch (arguments.length) {
        case 0:
            base = Object;
            data = {};
            break;
        case 1: 
            switch (typeof(base)) {
                case "function":
                    base = {};
                    break;
                case "object":
                    data = base || {};
                    base = Object;
                    break;
                default:
                    throw new TypeError("Invalid argument.");
            }
            break;
        default:
            if (!typeof(base) === "function") {
                throw new TypeError("Parameter 'base' must be a constructor function or undefined.");
            }
            if (!(data && (typeof(data) === "object"))) {
                throw new TypeError("Parameter 'base' must be a constructor function or undefined.");
            }
            break;
    }

    //Make sure data is kosher.
    fixupData(data);

    const TYPEID = Symbol(`base=${base.name}`);
    const handler = {
        offset: 0,
        get(target, prop, receiver) {
            let retval;
            if (prop === TARGET) {
                retval = target;
            }
            else if ((typeof(prop) == "string") && (prop[0] === TRIGGER)) {
                /**
                 * This is private member request. So the target doesn't matter.
                 * The real target is the prototype object with our TYPEID on it.
                 */
                let typeId = validateAccess(stack, this.offset);
                let pprop = prop.substr(1);
                let proto = getIdObject(typeId, Object.getPrototypeOf(receiver));
                let nameMap = protNameMap.get(base);

                //Remapping to prevent cousin class leakage.
                if (nameMap && (pprop in nameMap)) {
                    pprop = nameMap[pprop];
                }

                if (!proto) {
                    if (typeof(receiver) === "function") {
                        proto = receiver;
                    }
                    else {
                        throw new TypeError("Receiver does not contain the requested property.")
                    }
                }

                let ptarget = pvt.get(proto);
                retval = ptarget[pprop];
            }
            else {
                retval = Reflect.get(target, prop, receiver);
            }
            return retval;
        },
        set(target, prop, value, receiver) {
            let retval = false;
            if ((typeof(prop) == "string") && (prop[0] === TRIGGER)) {
                /**
                 * This is private member request. So the target doesn't matter.
                 * The real target is the prototype object with our TYPEID on it.
                 */
                let typeId = validateAccess(stack, this.offset);
                let pprop = prop.substr(1);
                let proto = getIdObject(typeId, Object.getPrototypeOf(receiver));

                if (!proto) {
                    throw new TypeError("Receiver does not contain the requested property.");
                }

                let ptarget = pvt.get(proto);
                if (pprop in ptarget) {
                    ptarget[pprop] = value;
                    retval = true;
                }
                else {
                    throw new TypeError("Receiver does not contain the requested property.");
                }
            }
            else {
                retval = Reflect.set(target, prop, value, receiver);
            }
            return retval;
        }
    };

    function getInstanceHandler(needSuper) {
        return {
            target: void 0,
            needSuper: !!needSuper,
            get(target, prop, receiver) {
                let retval;
                if (prop === SUPER_CALLED) {
                    this.needSuper = false;
                }
                if (this.needSuper && (prop !== "super") &&
                    !((typeof(target) === "function") && types.has(target))) {
                    throw new SyntaxError('Must call "this.super()" before using `this`');
                }

                if (this.target && !this.target.hasOwnProperty(prop)) {
                    prop = UNUSED;
                }
                
                try {
                    handler.offset = 1;
                    retval = handler.get(target, prop, receiver);
                }
                finally {
                    handler.offset = 0;
                }

                return retval;
            },
            set(target, prop, value, receiver) {
                let retval = false;

                if (this.needSuper && (prop !== "super"))
                    throw new SyntaxError('Must call "this.super()" before using `this`');

                try {
                    handler.offset = 1;
                    retval = handler.set(target, prop, value, receiver);
                }
                finally {
                    handler.offset = 0;
                }
                return retval;
            },
            ownKeys(target) {
                if (this.needsSuper)
                    throw new SyntaxError('Must call "this.super()" before using `this`');

                let retval;
                if (this.target) {
                    retval = Reflect.ownKeys(this.target);
                }
                else {
                    retval = Reflect.ownKeys(target);
                }
                return retval;
            },
            has(target, key) {
                if (this.needsSuper)
                    throw new SyntaxError('Must call "this.super()" before using `this`');

                let retval;
                if (this.target) {
                    retval = Reflect.has(this.target, key);
                }
                else {
                    retval = Reflect.has(target, key);
                }
                return retval;
            },
            defineProperty(target, prop, desc) {
                if (this.needsSuper)
                    throw new SyntaxError('Must call "this.super()" before using `this`');

                let retval;
                if ((typeof(prop) === "string") && (prop[0] === TRIGGER)) {
                    throw new SyntaxError(`Use of "${TRIGGER}" disallowed in first character of identifier.`);
                }
                else {
                    retval = Reflect.defineProperty(target, prop, desc);
                }
                return retval;
            },
            apply(target, context, args) {
                let fn = target[TARGET] || target;
                this.target = getIdObject(owners.get(fn), context);
                let retval = Reflect.apply(fn, context, args);
                this.target = void 0;
                return retval;
            }
        };
    }

    //Handle data conversion for the private and protected members;
    data = convertPrivates(data, stack, TYPEID);

    let shadow = function ClassBase(...args) {
        let hasCtor = shadow.prototype.hasOwnProperty("constructor");
        let retval, 
            baseTypeId = types.get(base),
            proto = new.target ? new.target.prototype : Object.getPrototypeOf(this),
            ancestor = hasCtor ? shadow.prototype.constructor : base,
            rawIdProto = Object.create(proto, {
                [TYPEID]: { value: void 0 },
                super: {
                    configurable: true,
                    value: function(...args) {
                        this[SUPER_CALLED];
                        return Super(shadow.prototype, this, base, ...args);
                    }
                }
            }),
            idProto = new Proxy(rawIdProto, handler);

        let pvtData = Object.create(data[Classic.PRIVATE]);
        pvt.set(idProto, pvtData);
        
        if (new.target) {
            if (isNative(ancestor) || (ancestor === base)) {
                let fake = function() {};
                fake.prototype = idProto;
                Object.setPrototypeOf(idProto, proto);
                retval = Reflect.construct(ancestor, args, fake);
                if (!hasCtor) {
                    Object.defineProperty(retval, baseTypeId, { value: void 0 });
                }
                runInitializers(idProto, shadow.prototype);
                runInitializers(pvtData, data[Classic.PRIVATE]);
            } 
            else{
                let instance = Object.create(idProto);
                let needSuper = (base !== Object) && (ancestor !== base);
                retval = ancestor.apply(new Proxy(instance, getInstanceHandler(needSuper)), args);
                if (retval === void 0) {
                    retval = instance;
                }
                Object.setPrototypeOf(this, instance);
                retval = this;
            }
        }
        else {
            retval = ancestor.apply(this, args) || this;
            Object.setPrototypeOf(retval, idProto);
        }
        delete rawIdProto.super;
        
        return new Proxy(retval, getInstanceHandler());
    }

    if (!types.has(base)) {
        types.set(base, Symbol(base.name));
    }

    types.set(shadow, TYPEID);
    Object.defineProperty(shadow, Symbol.hasInstance, {
        enumerable: true,
        value: function(instance) {
            let target = this[TARGET];
            return (types.has(target) && !!getIdObject(types.get(target), instance));
        }
    });
    
    shadow.prototype = Object.create(base.prototype, Object.getOwnPropertyDescriptors(data[Classic.PUBLIC]));
    protMap.set(shadow.prototype, data[Classic.PROTECTED]);
    Object.setPrototypeOf(shadow, base);

    if (shadow.prototype.hasOwnProperty("constructor")) {
        Object.setPrototypeOf(shadow.prototype.constructor, base);
    }

    Object.defineProperties(shadow, Object.getOwnPropertyDescriptors(data[Classic.STATIC][Classic.PUBLIC]));
    Object.defineProperty(shadow, TYPEID, { value: void 0 });
    shadow = new Proxy(shadow, getInstanceHandler());
    pvt.set(shadow, Object.create(data[Classic.STATIC][Classic.PRIVATE]));
    protMap.set(shadow, data[Classic.STATIC][Classic.PROTECTED]);
    
    let inheritance = getInheritance(base.prototype, TYPEID);
    if (inheritance) {
        Object.setPrototypeOf(data[Classic.PROTECTED], inheritance.data);
        Object.setPrototypeOf(data[Classic.PRIVATE], inheritance.data);
        protNameMap.set(base.prototype, inheritance.map);
    }
    inheritance = getInheritance(base, TYPEID);
    if (inheritance) {
        Object.setPrototypeOf(data[Classic.STATIC][Classic.PROTECTED], inheritance.data);
        Object.setPrototypeOf(data[Classic.STATIC][Classic.PRIVATE], inheritance.data);
        protNameMap.set(base, inheritance.map);
    }

    Object.seal(data[Classic.PRIVATE]);
    Object.seal(data[Classic.PROTECTED]);
    Object.seal(data[Classic.STATIC][Classic.PRIVATE]);
    Object.seal(data[Classic.STATIC][Classic.PROTECTED]);

    if (data[Classic.STATIC][Classic.PUBLIC].hasOwnProperty("constructor")) {
        data[Classic.STATIC][Classic.PUBLIC].constructor.call(shadow);
    }

    return shadow;
}

const AccessLevels = {
    Private: Symbol("ClassicJS::PRIVATE"),
    Protected: Symbol("ClassicJS::PROTECTED"),
    Public: Symbol("ClassicJS::PUBLIC"),
    Static: Symbol("ClassicJS::STATIC")
};

Object.defineProperties(Classic, {
    PrivateAccessSpecifier: {
        enumerable: true,
        get() { return TRIGGER; },
        set(v) {
            if ((typeof(v) === "string") && (v.length === 1) &&
                (["_", "$"].includes(v))) {
                TRIGGER = v;
            }
            else {
                throw new TypeError("Invalid private access specifier. Not altered.");
            }
        }
    },
    /**
     * 
     */
    UseStrings: {
        enumerable: true,
        get() { return useStrings; },
        set(v) { useStrings = !!v; }
    },
    STATIC: {
        enumerable: true,
        get() { return useStrings ? "static" : AccessLevels.Static; }
    },
    PRIVATE: {
        enumerable: true,
        get() { return useStrings ? "private" : AccessLevels.Private; }
    },
    PROTECTED: {
        enumerable: true,
        get() { return useStrings ? "protected" : AccessLevels.Protected; }
    },
    PUBLIC: {
        enumerable: true,
        get() { return useStrings ? "public" : AccessLevels.Public; }
    },
    PLACEHOLDER: {
        enumerable: true,
        value: Symbol(`Initializer PlaceHolder`)
    },
    init: {
        enumerable: true,
        value: function init(fn) {
            let retval = Object.freeze(Object.create(Object.prototype, {
                [Classic.PLACEHOLDER]: { value: void 0}
            }));
            initFns.set(retval, fn);
            return retval;
        }
    },
    getInitValue: {
        enumerable: true,
        value: function getInitValue(placeholder) {
            if (initFns.has(placeholder))
                return initFns.get(placeholder)();
        }
    }
}); 

module.exports = Classic;
console.log("Loaded Classic.js");
