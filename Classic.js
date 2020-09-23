/**
 * Adds peek() to Array to simplify looking at the top of the stack.
 */
class Stack extends Array {
    peek(n=0) { return this[this.length - (1 + n)]; }
}

const classDefs = new WeakMap;  //Processed definition of every declared class
const owners = new WeakMap;     //Map of functions to owning class & instances to a Stack of classes
const pvt = new WeakMap;        //Private data for each instance
const protMap = new WeakMap;    //Inheritable objects from each class
const initFns = new WeakMap;    //Map of initialization functions
const proxyMap = new WeakMap;   //Map of objects to privileged objects
const proxyMapR = new WeakMap;  //Map of privileged objects to objects
const stack = new Stack;        //Function registration used to validate access

const TARGET = Symbol("Proxy Target");          //Used to retrieve the target from the proxy
const UNUSED = Symbol("UNUSED");                //Used to ensure that a property isn't found.
const SUPER_CALLED = Symbol("SUPER_CALLED");    //Used to enable normal use of `this`.
const NEW_TARGET = Symbol("NEW_TARGET");        //Used to hide the transfer of new.target from the constructor

let useStrings = false;
let TRIGGER = '$';

/**
 * @typedef DataSpec
 * @property {Object} private - The prototype of the private data object for
 * each class instance.
 * @property {Object} protected - The object containing the prototype definition
 * of properties to be shared with subclasses.
 * @property {Object} public - The prototype of the public data object for each
 * class instance.
 */ 

/**
 * @typedef FlexibleProxy
 * This is a proxy that allows it's target to be altered.
 */
class FlexibleProxy {
    constructor(instance, newTarget, handler, needSuper) {
        let retval = new Proxy(instance, {
            current: instance,
            get(tgt, prop, receiver) {
                let retval;
                switch (prop) {
                    case NEW_TARGET:
                        retval = newTarget;
                        break;
                    case TARGET:
                        retval = this.current;
                        break;
                    case SUPER_CALLED:
                        retval = !needSuper;
                        break;
                    default:
                        retval = handler.get(this.current, prop, receiver, 1);
                        break;
                }
                return retval;
            },
            set(tgt, prop, value, receiver) {
                let retval = true;
                switch (prop) {
                    case TARGET:
                        this.current = value;
                        break;
                    case SUPER_CALLED:
                        if (needSuper)
                            needSuper = !value;
                        break;
                    default:
                        if (prop === TARGET) {
                            retval = handler.set(this.current, prop, value, receiver, 1);
                        }
                        else if (needSuper) {
                            throw new SyntaxError("Cannot use 'this' before calling super.");
                        }
                        else {
                            retval = handler.set(this.current, prop, value, receiver, 1);
                        }
                }
                return retval;
            }
        });
        proxyMapR.set(retval, instance);
        return retval;
    }

    static get TARGET() {
        //Lazy initialization of a constant
        Object.defineProperty(this, "TARGET", { value: Symbol("TARGET") });
        return this.TARGET;
    }
}

/**
 * Retrieves the concatenated list of all own string and symbol property names.
 * @param {Object} obj - Object to retrieve keys from.
 * @returns {[]} Array of all property name strings and symbols.
 */
function getAllOwnPropertyKeys(obj) {
    return Object.getOwnPropertyNames(obj).concat(Object.getOwnPropertySymbols(obj));
}

/**
 * Copies all own properties from the source into the destination.
 * @param {Object} dest - The object to receive the new properties.
 * @param {Object} src - The object containing the properties to be copied.
 */
function cloneProperties(dest, src) {
    Object.defineProperties(dest, Object.getOwnPropertyDescriptors(src));
}

/**
 * Generates a stupidly long sequence of random numbers that is likely to never
 * appear as a function name for use as a function name that can be identified
 * in a stack trace. This allows the handler logic to definitively identify
 * whether or not the calling function has private access.
 * @returns {String} The new function name.
 */
function makeFnName() { 
    function getBigRandom() { return parseInt(Math.random()*Number.MAX_SAFE_INTEGER); }
    return `_$${getBigRandom()}${getBigRandom()}${getBigRandom()}${getBigRandom()}$_`;
}

/**
 * Performs a lookup in a map of maps.
 * @param {(WeakMap|Map)} map - The map to read from.
 * @param {Object} key1 - Key in the outer map.
 * @param {Object} key2 - Key in the nested map.
 * @param {*} dflt - default value to return if lookup fails.
 * @returns Whatever was found, or the default value if lookup fails.
 */
function doubleMapGet(map, key1, key2, dflt) {
    let m = map.get(key1);
    return m ? m.get(key2) : dflt;
}

/**
 * Performs a storage in a map of maps.
 * @param {(WeakMap|Map)} map - The map to read from.
 * @param {Object} key1 - Key in the outer map.
 * @param {Object} key2 - Key in the nested map.
 * @param {*} value - The value to be saved
 */
function doubleMapSet(map, key1, key2, value) {
    !map.has(key1) && map.set(key1, new WeakMap);
    map.get(key1).set(key2, value);
}

/**
 * Recursively constructs the tree of protected properties using new Symbols
 * as property names instead of the original key values. The naming table maps
 * are saved in protMap.
 * @param {Function} owner - The constructor of the class that will own the
 * mapping being created.
 * @param {Object} parent - The constructor of the class that owns the
 * properties to remap.
 * @param {Boolean} isStatic - Uses the static protected properties if true.
 * @returns {Object} The newly created mapping of accessors.
 */
function mapAccessors(owner, parent, isStatic) {
    let retval = null;

    if (classDefs.has(parent)) {
        let defs = classDefs.get(parent);
        let src = isStatic ? defs[Classic.STATIC][Classic.PROTECTED] : defs[Classic.PROTECTED];
        let base = defs.base;
        let mapping = {f: {}, r: {}}; //forward & reverse mappings
        let keys = getAllOwnPropertyKeys(src);
        retval = {};
    
        for (let key of keys) {
            mapping.f[key] = Symbol(`${parent.name}::${key}`);
            mapping.r[mapping.f[key]] = key;
            Object.defineProperty(retval, mapping.f[key], Object.getOwnPropertyDescriptor(src, key));
        }
    
        protMap.set(isStatic ? owner : owner.prototype, mapping);
        
        if (classDefs.has(base)) {
            let proto = mapAccessors(owner, base, isStatic);
            Object.setPrototypeOf(retval, proto);
        }
    }

    return retval;
}

/**
 * Generates an accessor to get/set protected members, assigning a Symbol to
 * each property so names are class-specific, and preserving the resulting 
 * name:symbol map.
 * @param {Object} dest - Object to receive the generated accessor properties
 * @param {Object} src - Object containing the source properties
 * @param {(Object|Function)} base - Primary key used to determine what
 * will be retrieved (static or instance data, and for what class).
 */
function generateAccessors(dest, src, base) {
    let keys = getAllOwnPropertyKeys(src);

    //Generate a 2-way mapping for the protected keys.
    for (let key of keys) {
        Object.defineProperty(dest, key, {
            enumerable: true,
            get() {
                try {
                    let mkey2 = (typeof(this) === "function")
                        ? base
                        : this;
                    return doubleMapGet(pvt, base, mkey2[TARGET])[key];
                }
                catch(e) {
                    let name = "<anonymous>";
                    if (typeof(base) === "function") {
                        name = base.name || name
                    }
                    else if ((typeof(base) === "object") &&
                             (typeof(base.constructor === "function"))) {
                        name = base.constructor.name || name;
                    }
                    throw new SyntaxError(`Failed to get property: ${name}::${key.toString()}`, e);
                }
            },
            set(v) {
                try {
                    let mkey2 = (typeof(this) === "function")
                        ? base
                        : this;
                    doubleMapGet(pvt, base, mkey2[TARGET])[key] = v;
                }
                catch(e) {
                    let name = "<anonymous>";
                    if (typeof(base) === "function") {
                        name = base.name || name
                    }
                    else if ((typeof(base) === "object") &&
                             (typeof(base.constructor === "function"))) {
                        name = base.constructor.name || name;
                    }
                    throw new SyntaxError(`Failed to set property: ${name}::${key.toString()}`, e);
                }
            }
        });
    }
}

/**
 * Wraps fn with a uniquely identifiable function that ensures privileged
 * member functions can be identified.
 * @param {Function} fn - Target function to wrap
 * @param {Function|Object} owner - Constructor or prototype of the owning class.
 * @returns {Function} - uniquely named wrapper function
 */
function makePvtName(fn, owner) {
    let name = makeFnName();
    let retval = eval(`
        (function ${name}(...args) {
            let inst = proxyMap.get(this) || this;
            stack.push(${name});
            let retval = fn.apply(inst, args); 
            stack.pop();
            return retval;
        })
    `);

    Object.defineProperties(retval, {
        displayName: {
            value: `${fn.name} wrapper (as ${name})`
        },
        owner: {
            value: owner
        },
        bind: {
            configurable: true,
            writable: true,
            value: function bind(that, ...args) {
                that = that[TARGET] || that;
                return Function.prototype.bind.call(this, that, ...args);
            }
        },
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

    owners.set(retval, owner);
    return retval;
}

/**
 * Generates a copy of data where the protected object only contains accessors
 * back to the private data. All the actual properties are moved to the private
 * prototype object.
 * @param {DataSpec} data - The object containing the public data and non-public
 * members of the target class.
 * @param {Function} ctor - Constructor of the class whose data is being converted.
 * @param {Function|null} [base] - The base class being extended, if any.
 * @returns {Object} A processed version of the prototype object.
 */
function convertData(data, ctor, base) {
    let pvt = {},
        staticPvt = {},
        prot = {},
        staticProt = {},
        pub = {},
        staticPub = {},
        baseDef = classDefs.get(base) || {
            [Classic.PUBLIC]: (typeof(base) === "function")
                ? base.prototype
                : Object.prototype
        };

    //Put uniquely named wrappers around every function
    function convert(dest, src, owner) {
        let keys = getAllOwnPropertyKeys(src);

        for (let key of keys) {
            let desc = Object.getOwnPropertyDescriptor(src, key);

            if (key in dest) {
                Object.assign(desc, Object.getOwnPropertyDescriptor(dest, key));
            }

            if ("value" in desc) {
                if (typeof(desc.value) === "function") {
                    desc.value = makePvtName(desc.value, owner);
                }
            }
            else {
                if (("get" in desc) && desc.get) {
                    desc.get = makePvtName(desc.get, owner);
                }
                if (("set" in desc) && desc.set) {
                    desc.set = makePvtName(desc.set, owner);
                }
            }
            Object.defineProperty(dest, key, desc);
        }
    }
    
    //Sanity check. Are there unwanted keys?
    function findOrphans(obj, isStatic) {
        let keyset = new Set(getAllOwnPropertyKeys(obj));

        keyset.delete(Classic.PRIVATE);
        keyset.delete(Classic.PROTECTED);
        keyset.delete(Classic.PUBLIC);
        keyset.delete(Classic.CLASSNAME);
        keyset.delete(Classic.INHERITMODE);
        !isStatic && keyset.delete(Classic.STATIC);
    
        if (keyset.size > 0) {
            throw new SyntaxError(`Found orphan ${isStatic?"static ":""}keys: ${Array.from(keyset)}`);
        }    
    }

    findOrphans(data);
    findOrphans(data[Classic.STATIC], true);

    //Copy the private member template into the new object
    cloneProperties(pvt, data[Classic.PRIVATE]);
    cloneProperties(staticPvt, data[Classic.STATIC][Classic.PRIVATE]);

    //Copy the protected members into the private member template.
    cloneProperties(pvt, data[Classic.PROTECTED]);
    cloneProperties(staticPvt, data[Classic.STATIC][Classic.PROTECTED]);

    //Replace the protected members with accessor properties.
    generateAccessors(prot, data[Classic.PROTECTED], ctor);
    generateAccessors(staticProt, data[Classic.STATIC][Classic.PROTECTED], ctor);

    //Wrap the public data. We need to fixup prototypes before running mapAccessors.
    convert(pub, data[Classic.PUBLIC], ctor.prototype);
    convert(staticPub, data[Classic.STATIC][Classic.PUBLIC], ctor);
    ctor.prototype = pub;

    //Map the inherited protected members with the current protected members.
    let iProt = mapAccessors(ctor, base);
    let iStaticProt = mapAccessors(ctor, base, true);

    //Link the inherited protected members with the current private members.
    Object.setPrototypeOf(pvt, iProt);
    Object.setPrototypeOf(staticPvt, iStaticProt);

    //Link the inherited prototype with the current one.
    Object.setPrototypeOf(pub, baseDef[Classic.PUBLIC]);

    //Wrap all the functions. No need to wrap the protected blocks.
    convert(pvt, pvt, ctor.prototype);
    convert(staticPvt, staticPvt, ctor);

    let retval = {
        ancestry: [].concat(baseDef.ancestry || []),
        constructor: pub.constructor,
        [Classic.INHERITMODE]: data[Classic.INHERITMODE],
        [Classic.PRIVATE]: pvt,
        [Classic.PROTECTED]: prot,
        [Classic.PUBLIC]: pub,
        [Classic.STATIC]: {
            [Classic.PRIVATE]: staticPvt,
            [Classic.PROTECTED]: staticProt,
            [Classic.PUBLIC]: staticPub,
        }
    };
    retval.ancestry.push(base);

    return retval;
}

/**
 * Verifies that the currently running function is a privileged function and
 * has the right to access private members of the receiver.
 * @param {Number} offset - Count of library functions in the call stack.
 * @param {Object} receiver - Context object against which the request was made.
 * @returns {(Function|undefined)} The class constructor the current function
 * and receiver are allowed to access.
 */
function validateAccess(offset, receiver) {
    let eStack = (new Error).stack.split(/\n/);
    let fn = stack.peek();

    //V8 adds an error-type line in the stack trace.
    if (eStack[0] === "Error")
        eStack.shift();

    if (!eStack[3 + offset].includes(fn.name))
        throw new SyntaxError(`Invalid private access specifier encountered.`);

    let targetClass = owners.get(fn);
    let validClasses = owners.has(receiver)
        ? owners.get(receiver)
        : owners.get(receiver[TARGET]);

    if (typeof(targetClass) !== "function") {
        targetClass = targetClass.constructor;
        targetClass = proxyMap.get(targetClass) || targetClass;
    }

    if (!(validClasses && validClasses.includes(targetClass)))
        throw new SyntaxError(`Invalid private access specifier encountered.`);

    return targetClass;
}

/**
 * Checks to see if the passed function is a native function. It's more of a
 * quick guess than a certainty, but it's good enough to avoid getting fooled
 * by the average "bind" usage.
 * @param {Function} fn - Any function.
 * @returns {boolean}
 */
function isNative(fn) {
    return (typeof(fn) === "function") &&
           fn.toString().includes(fn.name) &&
           fn.toString().includes("[native code]");
}

/**
 * The super constructor-calling function.
 * @param {*} inst - The instance object for the class being constructed
 * @param {*} base - The superclass that needs to be initialized
 * @param  {...any} args - Arguments to the superclass constructor
 * @returns {any} - the result of initializing the superclass
 */
function Super(inst, base, ...args) {
    let newTarget = inst[NEW_TARGET];

    //Replace the target so the running constructor has the right object.
    inst[TARGET] = Reflect.construct(base, args, newTarget);
    
    return inst;
}

/**
 * Validates the data object and ensures that it meets the minimum requirements
 * to keep from causing errors in this code.
 * @param {Object} data - The data to be adjusted. 
 */
function fixupData(data) {
    let a = new Set([Classic.STATIC, Classic.PRIVATE, Classic.PROTECTED, Classic.PUBLIC]);

    data[Classic.CLASSNAME] = data[Classic.CLASSNAME] || "ClassBase";
    data[Classic.INHERITMODE] = [Classic.ABSTRACT, Classic.FINAL, undefined].includes(data[Classic.INHERITMODE]) 
        ? data[Classic.INHERITMODE]
        : undefined;

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
    let keys = getAllOwnPropertyKeys(mProto);
    let iProto = Object.getPrototypeOf(inst);
    let isID = pvt.has(inst);
    let src = (mProto instanceof iProto) ? iProto : mProto;

    for (let key of keys) {
        let def = Object.getOwnPropertyDescriptor(src, key);
        
        if ("value" in def) {
            let val = (def) ? def.value : undefined;

            if (initFns.has(val)) {
                inst[key] = initFns.get(val).call(this);
            }
            else if (isID && (typeof(val) !== "function")) {
                inst[key] = val;
            }
        }
    }
}

function getInheritedPropertyDescriptor(obj, prop) {
    let retval;
    obj = obj[TARGET] || obj;

    while (obj && (typeof(obj) === "object")) {
        if (Object.prototype.hasOwnProperty.call(obj, prop)) {
            retval = Object.getOwnPropertyDescriptor(obj, prop);
            break;
        }
        else {
            obj = Object.getPrototypeOf(obj);
            if (obj) {
                obj = obj[TARGET] || obj;
            }
        }
    }

    return retval;
}

/**
 * Produces an extendable function to be used as the base class for another
 * class. This allows a new class to contain prototype-based data while also
 * maintaining privilege levels that work properly even inside a Proxy.
 * @param {Function} [base] - Base class constructor to used. Defaults to Object.
 * @param {DataSpec} data - Object describing the data that will exist on the
 * prototype and it's corresponding privileges.
 * @returns {Function} - The constructor for the newly defined class. 
 * 
 * @property {String} PrivateAccessSpecifier - Used to set the identifier
 * character that is used to access non-public members. Can be either '$' or
 * '_'. Defaults to '$'.
 * @property {boolean} UseStrings - If set to true, the data parameter can use
 * the strings "public", "protected", "private", & "static" to define the
 * sections instead of their symbolic counterparts. Defaults to false.
 * @property {Function} init - Used to defer property assignment until an
 * instance is created. Causes each instance to receive a unique copy unless
 * the function is crafted to return the same value each call.
 * @property {Function} getInitValue - Used to retrieve an initialization value
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
    const PROTOTYPE = Symbol("PROTOTYPE");
    switch (arguments.length) {
        case 0:
            base = Object;
            data = {};
            break;
        case 1: 
            switch (typeof(base)) {
                case "function":
                    data = {};
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

    if (classDefs.has(base) && (classDefs.get(base)[Classic.INHERITMODE] === Classic.FINAL)) {
        throw new TypeError("Cannot extend a final class.");
    }

    const handler = {
        createSuper(receiver) {
            let retval = function _super(className) {
                if (!["function", "string", "undefined"].includes(typeof(className))) {
                    throw new TypeError(`If supplied a parameter, super() must be given a string or function.`)
                }
                let retval = base.prototype;
                if (className) {
                    let target = base;

                    while (target && (typeof(className) === "string")
                        ? (target.name !== className)
                        : (target != className)) {
                        target = Object.getPrototypeOf(target);
                    }

                    if (target) {
                        retval = target.prototype;
                    }
                }
                retval = new FlexibleProxy(retval, getInstanceHandler(false), handler);
                retval[TARGET] = receiver;
                return retval;
            };
            let newProto = (typeof(receiver) === "function") 
                ? base || null 
                : (base) 
                    ? base.prototype
                    : null;
            Object.setPrototypeOf(retval, newProto);
            let rval = new Proxy(retval, getInstanceHandler(false));
            proxyMapR.set(rval, retval);

            return retval;
        },
        privateAccess(prop, receiver, offset) {
            let targetClass = validateAccess(offset, receiver);
            let pprop = prop.substr(1);
            let pKey = (typeof(receiver) === "function")
                ? targetClass
                : targetClass.prototype;
            let tKey = receiver[TARGET] || receiver;
            let nameMap = (protMap.get(pKey) || {}).f;
            let ptarget = doubleMapGet(pvt, targetClass, tKey);

            if (nameMap && (pprop in nameMap)) {
                pprop = nameMap[pprop];
            }

            return { ptarget, pprop };
        },
        get(target, prop, receiver, offset) {
            let retval;
            offset = offset || 0;

            if (prop === TARGET) {
                if (receiver === proxyMap.get(target)) {
                    retval = target;
                }
            }
            else if ((prop === "super") && (target[SUPER_CALLED] !== false)) {
                if (prop in target) {
                    retval = Reflect.get(target, prop, receiver);
                }
                else {
                    retval = this.createSuper(target);
                }
            }
            else if ((typeof(prop) == "string") && (prop[0] === TRIGGER)) {
                let { ptarget, pprop } = this.privateAccess(prop, target, offset + 1);

                if (pprop === Classic.CLASS) {
                    retval = pShadow;
                }
                else {
                    retval = Reflect.get(ptarget, pprop, receiver);
                }
            }
            else {
                let desc = getInheritedPropertyDescriptor(target, prop);
                if (desc && desc.get && !/_\$\d{4,}\$_/.test(desc.get.name)) {
                    let context = receiver[TARGET] || target;
                    retval = desc.get.call(context);
                }
                else {
                    retval = Reflect.get(target, prop, receiver);
                }
            }

            if (![TARGET, TARGET, NEW_TARGET, "__proto__"].includes(prop) && 
                (typeof(retval) === "function") && 
                !/_\$\d{4,}\$_/.test(retval.name) &&
                ("_super" !== retval.name) &&
                (!isNative(retval) 
                 || new RegExp(`function ${retval.name}`).test(retval.toString()))) {
                retval = Function.prototype.bind.call(retval, target[TARGET] || target);
            }

            return retval;
        },
        set(target, prop, value, receiver, offset) {
            let retval = false;
            offset = offset || 0;

            //Don't ever store the Flexible proxy
            if (proxyMapR.has(value)) {
                let tValue = value[TARGET];
                if (proxyMap.has(tValue)) {
                    let pValue = proxyMap.get(tValue);
                    if (pValue !== value) {
                        value = pValue;
                    }
                }
            }

            if ((typeof(prop) == "string") && (prop[0] === TRIGGER)) {
                let { ptarget, pprop } = this.privateAccess(prop, receiver, offset + 1);

                if (pprop in ptarget) {
                    ptarget[pprop] = value;
                    retval = true;
                }
                else {
                    throw new TypeError("Receiver does not contain the requested property.");
                }
            }
            else {
                let desc = getInheritedPropertyDescriptor(target, prop);
                if (desc && desc.set && !/_\$\d{4,}\$_/.test(desc.set.name)) {
                    let context = receiver[TARGET] || target;
                    desc.set.call(context, value);
                    retval = true;
                }
                else {
                    retval = Reflect.set(target, prop, value, receiver);
                }
            }
            return retval;
        }
    };

    function getInstanceHandler(needSuper) {
        return {
            targetProto: void 0,
            needSuper: !!needSuper,
            top_proto: null,
            originalProto: null,
            get(target, prop, receiver) {
                let retval;
                if (prop === SUPER_CALLED) {
                    this.needSuper = false;
                }
                if (this.needSuper
                    && ![NEW_TARGET, "super"].includes(prop)
                    && !classDefs.has(target)) {
                    throw new SyntaxError('Must call "this.super()" before using `this`');
                }

                if ((prop === "prototype") && this.top_proto) {
                    retval = this.top_proto;
                }
                else {
                    //Make sure we can't accidentally find a property we shouldn't.
                    if (this.targetProto && !this.targetProto.hasOwnProperty(prop)) {
                        prop = UNUSED;
                    }
                    
                    retval = handler.get(target, prop, receiver, 1);
                }

                return retval;
            },
            set(target, prop, value, receiver) {
                let retval = false;

                if (this.needSuper && (prop !== "super"))
                    throw new SyntaxError('Must call "this.super()" before using `this`');

                if (prop === PROTOTYPE) {
                    this.top_proto = value;
                    retval = true;
                }
                else {
                    retval = handler.set(target, prop, value, receiver, 1);
                }

                return retval;
            },
            ownKeys(target) {
                if (this.needsSuper)
                    throw new SyntaxError('Must call "this.super()" before using `this`');

                return Reflect.ownKeys(target);
            },
            has(target, key) {
                if (this.needsSuper)
                    throw new SyntaxError('Must call "this.super()" before using `this`');

                let retval;
                if (this.targetProto) {
                    retval = Reflect.ownKeys(target).includes(key)
                        || Reflect.has(this.targetProto, key);
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
                this.targetProto = (owners.get(fn) || {}).prototype;
                let retval = Reflect.apply(fn, context, args);
                this.targetProto = void 0;
                return retval;
            }
        };
    }

    //Handle data conversion for the private and protected members;

    let className = data[Classic.CLASSNAME];
    let shadow = eval(`
    (function ${className}(...args) {
        if (!new.target) {
            return new ${className}(...args);
            // throw new TypeError("Class constructor ${className} cannot be invoked without 'new'");
        }
        
        let proto = Object.getPrototypeOf(this);
        let inheritMode = classDefs.get(shadow)[Classic.INHERITMODE];
    
        if ((inheritMode === Classic.ABSTRACT) && (proto === shadow.prototype)) {
            throw new TypeError("Cannot instantiate an abstract class.");
        }
        else if ((inheritMode === Classic.FINAL) && (proto !== shadow.protoype)) {
            throw new TypeError("Cannot extend a final class.");
        }
    
        function initData(instance) {
            //Instance might be a FlexibleProxy. We need the real raw instance.
            let rawInst = instance[TARGET] || instance;
            //Create and save a proxy to use internally. Yup, an instance is an inverse membrane!
            let pInstance = new Proxy(rawInst, getInstanceHandler());
            proxyMap.set(rawInst, pInstance);
            proxyMapR.set(pInstance, rawInst);
            //Create the private data pool.
            let pvtData = Object.create(data[Classic.PRIVATE]);
            //Initialize the public and private data.
            runInitializers(rawInst, shadow.prototype);
            runInitializers(pvtData, data[Classic.PRIVATE]);
            //Save the private data
            doubleMapSet(pvt, shadow, rawInst, pvtData);
            pvt.set(pShadow, pvt.get(shadow));
            doubleMapSet(pvt, shadow, pInstance, pvtData);
            //Add the instance to the owner list
            let ancestry = [].concat(data.ancestry);
            ancestry.push(pShadow);
            owners.set(rawInst, ancestry);
            owners.set(pInstance, ancestry);
        }
    
        let hasCtor = !!data.constructor;
        let retval, 
            ancestor = hasCtor ? data.constructor : base,
            superProto = Object.create(proto, {
                fake: {
                    configurable: true,
                    value: true
                },
                super: {
                    configurable: true,
                    value: function _super(...args) {
                        this[SUPER_CALLED] = true;
                        let instance = Super(this, base, ...args);
                        initData(instance[TARGET]);
                        return instance;
                    }
                }
            }),
            initProto = new Proxy(superProto, handler);
        
        proxyMapR.set(initProto, superProto)
        
        
        //Didn't provide a public constructor function
        if (!hasCtor) {
            retval = Reflect.construct(ancestor, args, new.target);
            initData(retval);
        } 
        else { //Provided a public constructor
            let needSuper = (base !== Object);
            let instance = this;
            
            if (needSuper) {
                instance = new FlexibleProxy(Object.create(initProto), new.target, handler, needSuper)
            }
            else {
                //Init the data if super() won't be called.
                initData(instance);
                instance = proxyMap.get(instance);
            }
    
            //Run the constructor function.
            retval = ancestor.apply(instance, args);
    
            if (retval === void 0) {
                retval = needSuper
                    ? instance[TARGET]
                    : this;
            }
        }
       
        //Return the unproxied version. We want to be Custom Elements compliant!
        return retval;
    })
    //# sourceURL=${className}.js    
    `);

    //Proxy the internal constructor function.
    let pShadow = new Proxy(shadow, getInstanceHandler());
    proxyMap.set(shadow, pShadow);
    proxyMapR.set(pShadow, shadow);
    
    //Reify the class definition.
    data = convertData(data, pShadow, base);

    //Fixup the class constructor...
    Object.defineProperty(shadow.prototype, "constructor", {
        enumerable: true,
        value: pShadow
    });
    Object.setPrototypeOf(shadow, base);
    cloneProperties(shadow, data[Classic.STATIC][Classic.PUBLIC]);
    delete shadow.constructor;  //...but don't add the static constructor!!!

    //Save the reified definition for later. Inheritors need to know.
    classDefs.set(shadow, data);
    classDefs.set(pShadow, data);

    //Create the static private data object.
    {
        let spvtData = Object.create(data[Classic.STATIC][Classic.PRIVATE]);
        
        doubleMapSet(pvt, shadow, shadow, spvtData);
        pvt.set(pShadow, pvt.get(shadow));
        doubleMapSet(pvt, pShadow, pShadow, spvtData);
    }

    //Fixup "instanceof" so it's a little less flakey.
    Object.defineProperty(shadow, Symbol.hasInstance, {
        enumerable: true,
        value: function(instance) {
            return owners.has(instance)
                && owners.get(instance).includes(this);
        }
    });

    //Seal up everything not private
    Object.seal(data[Classic.PRIVATE]);
    Object.seal(data[Classic.PROTECTED]);
    Object.seal(data[Classic.STATIC][Classic.PRIVATE]);
    Object.seal(data[Classic.STATIC][Classic.PROTECTED]);

    //Register the heritage of the constructor for private access.
    let ancestry = [].concat(data.ancestry);
    ancestry.push(pShadow);
    owners.set(shadow, ancestry);
    owners.set(pShadow, ancestry);

    //Call any existing static constructor
    if (data[Classic.STATIC][Classic.PUBLIC].hasOwnProperty("constructor")) {
        data[Classic.STATIC][Classic.PUBLIC].constructor.call(pShadow);
    }

    return pShadow;
}

const AccessLevels = {
    Private: Symbol("ClassicJS::PRIVATE"),
    Protected: Symbol("ClassicJS::PROTECTED"),
    Public: Symbol("ClassicJS::PUBLIC"),
    Static: Symbol("ClassicJS::STATIC")
};

const ClassConfigKeys = {
    ClassName: Symbol("ClassicJS::CLASSNAME"),
    InheritMode: Symbol("ClassicJS::INHERITMODE")
};

const ClassConstants = {
    CLASS: Symbol("ClassicJS::CLASS"),
    ABSTRACT: Symbol("ClassicJS::ABSTRACT"),
    FINAL: Symbol("ClassicJS::FINAL")
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
    CLASSNAME: {
        enumerable: true,
        get() { return useStrings ? "className" : ClassConfigKeys.CLASSNAME; }
    },
    INHERITMODE: {
        enumerable: true,
        get() { return useStrings ? "inheritMode" : ClassConfigKeys.INHERITMODE; }
    },
    PLACEHOLDER: {
        enumerable: true,
        value: Symbol(`Initializer PlaceHolder`)
    },
    CLASS: {
        enumerable: true,
        get() { return useStrings ? "cla$$" : ClassConstants.CLASS;}
    },
    ABSTRACT: {
        enumerable: true,
        get() { return useStrings ? "abstract" : ClassConstants.ABSTRACT; }
    },
    FINAL: {
        enumerable: true,
        get() { return useStrings ? "final" : ClassConstants.FINAL; }
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
