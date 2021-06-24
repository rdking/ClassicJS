const classDefs = new WeakMap;  //Processed definition of every declared class
const owners = new WeakMap;     //Map of functions to owning class & instances to a Stack of classes
const pvt = new WeakMap;        //Private data for each instance
const protMap = new WeakMap;    //Inheritable objects from each class
const accessors = new WeakMap;  //Map of instance private accessor objects
const initFns = new WeakMap;    //Map of initialization functions
const buildQueue = new WeakMap; //Map of arrays to queue building private data
const memberList = new WeakMap; //Map of classes to unique names
const fnMap = new Map;          //Map of unique names to the target functions

const SUPER_CALLED = Symbol("SUPER_CALLED");    //Used to enable normal use of `this`.
const NEW_TARGET = Symbol("NEW_TARGET");        //Used to hide the transfer of new.target from the constructor
const BUILD_KEY = Symbol("BUILD_KEY");          //Used to pass along the key instance
const FAKE = Symbol("FAKE");                    //Used to mark the temporary object used during construction
const INSTANCE = Symbol("INSTANCE");            //Used to change the current instance in the constructor.
const TOKEN = Symbol("TOKEN");                  //Used as the map key for a class or instance in lieu of the instance itself.

let useStrings = false;
let TRIGGER = '$';
let anonCount = 0;
let rOffset = 0;
const asyncStack = [];

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
 * Retrieves the concatenated list of all own string and symbol property names.
 * @param {Object} obj - Object to retrieve keys from.
 * @returns {[]} Array of all own property name strings and symbols.
 */
function getAllOwnPropertyKeys(obj) {
    return Object.getOwnPropertyNames(obj).concat(Object.getOwnPropertySymbols(obj));
}

/**
 * Retrieves the concatenated list of all string and symbol property names,
 * recursively. This does not retrieve the keys on Object.prototype.
 * @param {Object} obj - Object to retrieve keys from.
 * @returns {[]} Array of all property name strings and symbols.
 */
function getAllPropertyKeys(obj) {
    let retval = getAllOwnPropertyKeys(obj);
    while (![null, Object.prototype].includes(obj = Object.getPrototypeOf(obj))) {
        retval = retval.concat(getAllOwnPropertyKeys(obj));
    }
    return Array.from((new Set(retval)).keys());
}

/**
 * Returns the property descriptor of any property in the given object,
 * regardless of whether or not the property is an own property.
 * @param {Object} obj - Object that owns the named property.
 * @param {string} prop - Name of the property to look up.
 * @returns {Object} The property descriptor for the named property, or null
 * if the property doesn't exist in the object.
 */
function getPropertyDescriptor(obj, prop) {
    let retval = null;

    while (!retval && obj) {
        retval = Object.getOwnPropertyDescriptor(obj, prop);
        obj = Object.getPrototypeOf(obj);
    }

    return retval;
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
 * @param {Object} defs - The definition object for the owner class.
 * @param {Object} parent - The constructor of the class that owns the
 * properties to remap.
 * @param {Boolean} isStatic - Uses the static protected properties if true.
 * @returns {Object} The newly created mapping of accessors.
 */
function mapAccessors(owner, defs, parent, isStatic) {
    let retval = null;
    let mapping = {f: {}, r: {}}; //forward & reverse mappings

    //TODO: REMEMBER TO ACCOUNT FOR OVERRIDES!!!!

    if (classDefs.has(parent)) {
        let pDefs = classDefs.get(parent);
        let pSrc = (isStatic ? pDefs[Classic.STATIC] : pDefs)[Classic.PROTECTED];
        let oSrc = (isStatic ? defs[Classic.STATIC] : defs)[Classic.PROTECTED];
        let nmKey = isStatic ? parent : (parent.prototype || {});
        let nameMap = protMap.get(nmKey)?.r || {};
        let keys = getAllPropertyKeys(pSrc);
        retval = {};
    
        for (let key of keys) {
            if (!(key in oSrc)) {
                let fName = (nameMap && key in nameMap) ? nameMap[key] : key;
                mapping.f[fName] = Symbol(`${parent.name}::${fName.toString()}`);
                mapping.r[mapping.f[fName]] = fName;
                Object.defineProperty(retval, mapping.f[fName], getPropertyDescriptor(pSrc, key));
            }
        }
    }
    
    protMap.set(isStatic ? owner : owner.prototype, mapping);

    return retval;
}

/**
 * Generates an initialization function for each key in the protected key
 * template. The initialization function creates an accessor to get/set the
 * protected member.
 * @param {Object} dest - Object to receive the generated accessor properties
 * @param {Object} src - Object containing the source properties
 * will be retrieved (static or instance data, and for what class).
 */
function generateAccessorGenerators(dest, src, base) {
    let keys = getAllOwnPropertyKeys(src);

    //Generate a 2-way mapping for the protected keys.
    for (let key of keys) {
        Object.defineProperty(dest, key, {
            configurable: true,
            value: function generateAccessor(newKey) {
                Object.defineProperty(this, newKey, {
                    enumerable: true,
                    get() {
                        let retval;
                        try {
                            let mkey = (typeof(this) == "function") ? base : this;
                            retval = doubleMapGet(pvt, base, mkey)[key];
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
                        return retval;
                    },
                    set(v) {
                        try {
                            let mkey2 = (typeof(this) == "function") ? base : this;
                            doubleMapGet(pvt, base, mkey2)[key] = v;
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
        });
    }
}

/**
 * Wraps fn with a uniquely identifiable function that ensures privileged
 * member functions can be identified.
 * @param {Function} fn - Target function to wrap
 * @param {Function|Object} owner - Constructor or prototype of the owning class.
 * @param {Function} ownerClass - Constructor of the owning class.
 * @returns {Function} - uniquely named wrapper function
 */
function makePvtName(fn, owner, ownerClass) {
    let name = makeFnName();
    let className = `${ownerClass.name}${(owner === ownerClass) ? "/static" : ""}`;
    let path = className + `/${fn.name.replace(" ", "-")}.js`;
    let isGen = (new RegExp(`function*\\s${fn.name}`)).test(fn.toString());
    let isAsync = !isGen && (new RegExp(`async\\s${fn.name}`)).test(fn.toString());
    let retval = eval(`
        (${isAsync ? "async ": ""}function ${name}(...args) {
            ${isAsync ? `asyncStack.push(getStack());
            `: ""}let retval = ${isAsync ? "await ": ""}fn.apply(this, args); 
            ${isAsync ? `asyncStack.pop();`
            : ""}return retval;
        })
        //# sourceURL=${typeof(window)=="object"?window.location.origin:""}/ClassicJSGenerated/${path}
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

    memberList.get(ownerClass).push(name);
    fnMap.set(name, new WeakRef(retval));
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
                ? base.prototype : Object.prototype
        };

    //Put uniquely named wrappers around every function
    function convert(dest, src, owner, ownerClass) {
        let keys = getAllOwnPropertyKeys(src);

        for (let key of keys) {
            let desc = Object.getOwnPropertyDescriptor(src, key);

            if (key in dest) {
                Object.assign(desc, Object.getOwnPropertyDescriptor(dest, key));
            }

            if ("value" in desc) {
                if (typeof(desc.value) === "function") {
                    if ((desc.value === Classic.ABSTRACT_FN) &&
                        (data.inheritMode != Classic.ABSTRACT)) {
                        throw new SyntaxError("Cannot assign Classic.ABSTRACT_FN in non-abstract class.");
                    }
                    desc.value = makePvtName(desc.value, owner, ownerClass);
                }
            }
            else {
                if (("get" in desc) && desc.get) {
                    desc.get = makePvtName(desc.get, owner, ownerClass);
                }
                if (("set" in desc) && desc.set) {
                    desc.set = makePvtName(desc.set, owner, ownerClass);
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
    generateAccessorGenerators(prot, data[Classic.PROTECTED], ctor);
    generateAccessorGenerators(staticProt, data[Classic.STATIC][Classic.PROTECTED], ctor);

    //Wrap the public data. We need to fixup prototypes before running mapAccessors.
    ctor.prototype.constructor = ctor;
    convert(pub, data[Classic.PUBLIC], ctor.prototype, ctor);
    convert(staticPub, data[Classic.STATIC][Classic.PUBLIC], ctor, ctor);
    ctor.prototype = pub;

    //Map the inherited protected members with the current protected members.
    let iProt = mapAccessors(ctor, data, base);
    let iStaticProt = mapAccessors(ctor, data, base, true);

    //Link the inherited protected members with the current private members.
    Object.setPrototypeOf(pvt, iProt);
    Object.setPrototypeOf(staticPvt, iStaticProt);

    //Link the inherited protected members with the current protected members as well.
    Object.setPrototypeOf(prot, iProt);
    Object.setPrototypeOf(staticProt, iStaticProt);

    //Wrap all the functions. No need to wrap the protected blocks.
    convert(pvt, pvt, ctor.prototype, ctor);
    convert(staticPvt, staticPvt, ctor, ctor);

    let retval = {
        className: data.className,
        ancestry: [ctor].concat(baseDef.ancestry || []),
        constructor: pub.hasOwnProperty("constructor") ? pub.constructor : void 0,
        staticConstructor: staticPub.hasOwnProperty("constructor") ? staticPub.constructor : void 0,
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
    delete staticPub.constructor;

    //Link the inherited prototype with the current one.
    Object.setPrototypeOf(pub, base.prototype || null);

    return retval;
}

/**
 * Gets as complete a stack frame as possible
 * @returns Array representing current stack frame + async frame
 */
 function getStack() {
    let retval = (new Error).stack.split(/\n/);
    //Some browsers add an error-type line in the stack trace.
    if (retval[0].substr(0,5) === "Error")
        retval.shift();

    //Remove getStack from the call list;
    retval.shift();
    if (!retval[retval.length-1].length) {
        retval.pop();
    }

    let browser = globalThis?.navigator?.userAgent ?? "";
    if (asyncStack.length && browser.includes("Firefox")) {
        retval = retval.concat(asyncStack[asyncStack.length-1]);
    }

    return retval;
}

function getClassFn(offset) {
    let retval = null;
    let eStack = getStack();//(new Error).stack.split(/\n/);
    //V8 adds an error-type line in the stack trace.
    if (eStack[0].substr(0,5) === "Error")
        eStack.shift();

    let line = eStack[3 + offset] ?? "";
    let match = line.match(/(_\$\d{4,}\$_)/);
    
    if (match) {
        retval = fnMap.get(match[1]);
        if (retval) {
            retval = retval.deref();
        }
    }

    return retval;
}

/**
 * Verifies that the currently running function is a privileged function and
 * has the right to access private members of the receiver.
 * @param {Number} offset - Count of library functions in the call stack.
 * @param {Object} receiver - Context object against which the request was made.
 * @param {Boolean} isSuper - if true, then the target class changes to the
 * parent of the owner of the current privileged function.
 * @returns {(Function|undefined)} The class constructor the current function
 * and receiver are allowed to access.
 */
function validateAccess(offset, receiver, isSuper) {
    //Look for what should be a known function.
    let fn = getClassFn(offset + 1);

    if (!fn)
        throw new SyntaxError(`Invalid private access specifier encountered.`);

    let instanceClass = (typeof(receiver) !== "function") ? receiver.constructor : receiver;
    let targetClass = owners.get(fn);
    let validClasses = owners.get(instanceClass);

    if (typeof(targetClass) !== "function") {
        targetClass = targetClass.constructor;
    }

    if (isSuper) {
        targetClass = Object.getPrototypeOf(targetClass);
    }

    if (!(validClasses && validClasses.includes(targetClass)))
        throw new SyntaxError(`Invalid private access specifier encountered.`);

    return { targetClass, instanceClass };
}

/**
 * Checks to see if the passed function is a native function. It's more of a
 * quick guess than a certainty, but it's good enough to avoid getting fooled
 * by the average "bind" usage.
 * @param {Function} fn - Any function.
 * @param {boolean} bound - true if we're looking for a bound function
 * @returns {boolean}
 */
function isNative(fn, bound) {
    return (typeof(fn) === "function") &&
           (bound ||fn.toString().includes(fn.name)) &&
           fn.toString().includes("[native code]");
}

/**
 * The super constructor-calling function.
 * @param {*} inst - The instance object for the class being constructed
 * @param {*} base - The superclass that needs to be initialized
 * @param {*} keyInst - The fake instance created by the initiating descendant class
 * @param  {...any} args - Arguments to the superclass constructor
 * @returns {any} - the result of initializing the superclass
 */
function Super(inst, base, keyInst, ...args) {
    let newTarget = inst[NEW_TARGET];
    inst[SUPER_CALLED] = true;

    //Pass the key instance to the constructor of the ancestor
    base[BUILD_KEY] = keyInst;

    //Replace the target so the running constructor has the right object.
    let newInst = Reflect.construct(base, args, newTarget);
    inst[INSTANCE] = newInst;
    base[BUILD_KEY] = null;

    if (isNative(base)) {
        //Run through and initialize all the private areas.
        let queue = buildQueue.get(keyInst);
        while (queue.length) {
            let fn = queue.pop();
            fn(newInst);
        }
        buildQueue.delete(keyInst);
    }
    
    return inst;
}

/**
 * Validates the data object and ensures that it meets the minimum requirements
 * to keep from causing errors in this code.
 * @param {Object} data - The data to be adjusted. 
 */
function fixupData(data) {
    let a = new Set([Classic.STATIC, Classic.PRIVATE, Classic.PROTECTED, Classic.PUBLIC]);

    data[Classic.CLASSNAME] = data[Classic.CLASSNAME] || "anonymous" + anonCount++;
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
    let src = Object.prototype.isPrototypeOf(mProto, iProto) ? iProto : mProto;

    for (let key of keys) {
        let def = getInheritedPropertyDescriptor(src, key);
        
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

    while (obj && (typeof(obj) === "object")) {
        if (Object.prototype.hasOwnProperty.call(obj, prop)) {
            retval = Object.getOwnPropertyDescriptor(obj, prop);
            break;
        }
        else {
            obj = Object.getPrototypeOf(obj);
        }
    }

    return retval;
}

function bindFn(fn, inst, prop) {
    let retval = fn;
    if (![Symbol.hasInstance, Classic.CLASS, "constructor", "super"].includes(prop) && 
        (typeof(retval) == "function") && /*!isNative(retval) &&*/
        (Object.prototype.isPrototypeOf !== retval) &&
        //!/(_\$\d{4,}\$_)|(_super)/.test(retval.name) &&
        !retval.bound) {
        retval = Function.prototype.bind.call(retval, inst);
        retval.bound = true;
    }
    return retval;
}

/**
 * Stages private data access on an instance by setting up the required
 * accessors.
 * @param {Object|Function} inst The instance object that owns the private data.
 * @param {*} pData The private data container.
 * @param {Function} _class The class whose private data is being staged.
 * @param {Function?} newTarget The class being instantiated.
 */
function stagePrivateDataAccess(inst, pData, _class, newTarget) {
    let keys = getAllPropertyKeys(pData);
    let pa = Object.create(null);
    let getDesc = function (token) {
        return {
            get: function privateAccess() {
                let offset = rOffset;
                rOffset = 0;
                if (token === TRIGGER) {
                    let {targetClass, instanceClass} = validateAccess(offset + 1, this);
                    let retval = doubleMapGet(accessors, targetClass, this[TOKEN]);
                    retval = Object.seal(Object.create(retval, {[INSTANCE]: { value: this[INSTANCE] ?? this }}));
                    return retval;
                }
            }
        };
    };

    let getPrivate = (prop, offset) => {
        let {targetClass, instanceClass} = validateAccess(offset + rOffset + 1, inst);
        let ptarget, pprop;
        let extract = (byClass) => {
            let mapKey = (typeof(inst) == "function") ? inst : inst.constructor.prototype;
            let nameMap = (protMap.get(mapKey) || {}).f;
            
            ptarget = doubleMapGet(pvt, byClass, inst);
            pprop = (nameMap && (prop in nameMap))
                ? nameMap[prop] : prop;

            if (!ptarget || !(pprop in ptarget)) {
                throw new SyntaxError(`Invalid private access specifier encountered.`);
            }
        }

        rOffset = 0;

        try {
            extract(instanceClass);
        }
        catch(e) {
            extract(targetClass);
        }

        return { ptarget, pprop };
    }

    let getGetter = (prop) => {
        return function getter() {
            let {ptarget, pprop} = getPrivate(prop, 1);
            let retval = Reflect.get(ptarget, pprop, inst);
            return bindFn(retval, this[INSTANCE], prop);
        }
    };

    let getSetter = (prop) => {
        return function setPrivate(val) {
            let {ptarget, pprop} = getPrivate(prop, 1);
            return Reflect.set(ptarget, pprop, val, ptarget);
        }
    }

    if (!(TOKEN in inst)) {
        function createSuper() {
            let currentFn = getClassFn(1);
            let currentClass = owners.get(currentFn);
            let self = this;
            let retval;

            if (typeof(currentClass) == "object") {
                currentClass = currentClass.constructor;
            }

            if (currentClass) {
                currentClass = Object.getPrototypeOf(currentClass);
            }
            
            if (typeof(currentFn) == "function") {
                let genProto = (target) => {
                    let keys = getAllPropertyKeys(target.prototype);
                    let proto = Object.defineProperty({}, "isSuper", { value: true });
                    let getGetter = prop => () => bindFn(target.prototype[prop], self, prop);
                    
                    for (let key of keys) {
                        if ((key != "constructor") && !(key in proto)) {
                            Object.defineProperty(proto, key, { get: getGetter(key) });
                        }
                    }

                    return proto;
                }
                
                retval = function _super(className) {
                    if (!["function", "string", "undefined"].includes(typeof(className))) {
                        throw new TypeError(`If supplied a parameter, super() must be given a string or function.`)
                    }
                    let retval = currentClass.prototype;
                    if (className) {
                        let target = currentClass;

                        while (target && (typeof(className) == "string")
                            ? (target.name != className)
                            : (target !== className)) {
                            target = Object.getPrototypeOf(target);
                        }
    
                        if (target) {
                            retval = genProto(target);
                        }
                    }

                    return retval;
                };

                Object.setPrototypeOf(retval, genProto(currentClass));
            }

            return retval;
        }
        
        Object.defineProperties(inst, {
            $: getDesc("$"),
            _: getDesc("_"),
            [TOKEN]: { value: inst },
            cla$$: { get: () => newTarget ?? inst },
            super: { get: createSuper }
        });
    }
    
    let mapKey = (typeof(inst) == "function") ? inst : inst.constructor.prototype;
    let nameMap = (protMap.get(mapKey) || {}).r;
    for (let key of keys) {
        let prop = key;
        if (typeof(key) == "symbol") {
            key = nameMap[key];
        }
        if (key in pa) {
            continue;
        }
        
        Object.defineProperty(pa, key, {
            get: getGetter(prop),
            set: getSetter(prop)
        });
    }
    
    doubleMapSet(accessors, _class, inst[TOKEN], Object.seal(pa));
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

    function getInstanceHandler(newTarget, needSuper) {
        return {
            current: null,

            get(_, prop, receiver, offset=0, isSuper) {
                let retval;
                switch (prop) {
                    case NEW_TARGET:
                        retval = newTarget;
                        break;
                    case SUPER_CALLED:
                        retval = !needSuper;
                        break;
                    case INSTANCE:
                        retval = this.current;
                        break;
                    default:
                        if (needSuper && ![FAKE, "super"].includes(prop)) {
                            throw new SyntaxError('Must call "this.super()" before using `this`');
                        }
                        rOffset = rOffset + offset + 2;
                        retval = Reflect.get(this.current, prop, receiver);
                        rOffset = 0;
                        retval = bindFn(retval, this.current, prop);
                }
                return retval;
            },
            set(_, prop, value, receiver, offset=0) {
                let retval = true;
                switch (prop) {
                    case SUPER_CALLED:
                        if (needSuper)
                            needSuper = !value;
                        break;
                    case INSTANCE:
                        this.current = value;
                        break;
                    default:
                        if (needSuper) {
                            throw new SyntaxError('Must call "this.super()" before using `this`');
                        }
                        rOffset = rOffset + offset + 2;
                        retval = Reflect.set(this.current, prop, value, this.current);
                        rOffset = 0;
                }
                return retval;
            },
            defineProperty(_, prop, desc) { return Reflect.defineProperty(this.current, prop, desc); },
            deleteProperty(_, prop) { return Reflect.deleteProperty(this.current, prop); },
            getOwnPropertyDescriptor(_, prop) { return Reflect.getOwnPropertyDescriptor(this.current, prop); },
            getPrototypeOf(_) { return Reflect.getPrototypeOf(this.current); },
            has(_, key) { return Reflect.has(this.current, key); },
            isExtensible(_) { return Reflect.isExtensible(this.current); },
            ownKeys(_) { return Reflect.ownKeys(this.current); },
            preventExtensions(_) { return Reflect.preventExtensions(this.current); },
            setPrototypeOf(_, proto) { return Reflect.setPrototypeOf(this.current, proto); }
        };
    }

    let className = data[Classic.CLASSNAME];
    let shadow = eval(`
        (function ${className}(...args) {
            let newTarget = new.target;
            if (!newTarget) {
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
                //Create the private data pool.
                let pvtData = Object.create(data[Classic.PRIVATE]);
                let map = protMap.get(shadow.prototype);
                let ntMap = protMap.get(newTarget.prototype);
                let keys = Object.getOwnPropertySymbols(map?.r ?? {});
                for (let key of keys) {
                    let ntKey = ntMap.f[map.r[key]] ?? key;
                    if (!pvtData.hasOwnProperty(key)) {
                        pvtData[key](ntKey);
                    }
                }
                //Save the private data
                doubleMapSet(pvt, shadow, instance, pvtData);
                //Initialize the public and private data.
                stagePrivateDataAccess(instance, pvtData, shadow, newTarget);
                runInitializers(instance, shadow.prototype);
                runInitializers(pvtData, data[Classic.PRIVATE]);
                //Add the instance to the owner list
                owners.set(instance, data.ancestry);
            }
            
            let keyInst = shadow[BUILD_KEY];
            let needSuper = (base !== Object);
            let hasCtor = !!data.constructor;
            let ancestor = hasCtor ? data.constructor : base;
            let fakeProto = Object.create(proto, {
                [FAKE]: {
                    configurable: true,
                    value: true
                },
                super: {
                    configurable: true,
                    value: function _super(...args) {
                        if (!needSuper) {
                            throw new SyntaxError("'this.super' call unexpected here");
                        }
                        let instance = Super(this, base, keyInst, ...args);
                        return instance;
                    }
                }
            });
            let fakeInst = Object.create(fakeProto);
            let handler = getInstanceHandler(new.target, needSuper);
            let instance = new Proxy(fakeInst, handler);
            let retval;
        
            handler.current = fakeInst;
            owners.set(fakeInst, data.ancestry);
            owners.set(instance, data.ancestry);
            keyInst = keyInst || instance;
            
            if (!buildQueue.has(keyInst)) {
                buildQueue.set(keyInst, []);
            }
        
            let queue = buildQueue.get(keyInst);
            queue.push(initData.bind(instance));
        
            //Didn't provide a public constructor function
            if (!hasCtor) {
                retval = Super(instance, base, keyInst, ...args);
            } 
            else { //Provided a public constructor
                //Run the constructor function.
                if (!needSuper || (ancestor === Object)) {
                    Super(instance, base, keyInst, ...args);
                }
                retval = ancestor.apply(instance, args);
            }
            
            if (!retval) {
                retval = handler.current;
            }
            else {
                retval = retval[INSTANCE] || retval;
            }

            owners.delete(fakeInst);
        
            //Return the unproxied version. We want to be Custom Elements compliant!
            return retval;
        })
        //# sourceURL=${typeof(window)=="object"?window.location.origin:""}/ClassicJSGenerated/${className}/ClassJS-constructor.js    
    `);

    memberList.set(shadow, (memberList.get(base) ?? []).slice());
    //Reify the class definition.
    data = convertData(data, shadow, base);

    //Fixup the class constructor...
    shadow.prototype = data[Classic.PUBLIC];
    Object.defineProperty(shadow.prototype, "constructor", {
        enumerable: true,
        value: shadow
    });

    Object.setPrototypeOf(shadow, base);
    cloneProperties(shadow, data[Classic.STATIC][Classic.PUBLIC]);
    //Save the reified definition for later. Inheritors need to know.
    classDefs.set(shadow, data);

    //Create the static private data object.
    let spvtData = Object.create(data[Classic.STATIC][Classic.PRIVATE]);
    let keys = Object.getOwnPropertySymbols(protMap.get(shadow).r);
    for (let key of keys) {
        spvtData[key](key);
    }
    doubleMapSet(pvt, shadow, shadow, spvtData);
    stagePrivateDataAccess(shadow, spvtData, shadow);

    //Fixup "instanceof" so it's a little less flakey.
    Object.defineProperty(shadow, Symbol.hasInstance, {
        enumerable: true,
        value: function(instance) {
            return owners.has(instance)
                && owners.get(instance).includes(this);
        }
    });

    //Seal up everything private
    Object.seal(data[Classic.PRIVATE]);
    Object.seal(data[Classic.STATIC][Classic.PRIVATE]);

    //Register the heritage of the constructor for private access.
    owners.set(shadow, data.ancestry);

    //Call any existing static constructor
    if (!!data.staticConstructor) {
        data.staticConstructor.call(shadow);
    }

    return shadow;
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
    FINAL: Symbol("ClassicJS::FINAL"),
    ABSTRACT_FN: function abstract() {
        throw new ReferenceError("Cannot call an abstract function.");
    }
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
        get() { return useStrings ? "className" : ClassConfigKeys.ClassName; }
    },
    INHERITMODE: {
        enumerable: true,
        get() { return useStrings ? "inheritMode" : ClassConfigKeys.InheritMode; }
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
    ABSTRACT_FN: {
        enumerable: true,
        get() { return ClassConstants.ABSTRACT_FN; }
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
    },
    getInstance: {
        enumerable: true,
        value: function getInstance(obj) {
            return obj[INSTANCE];
        }
    }
}); 

module.exports = Classic;
