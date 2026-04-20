const fs = require('fs'),
	path = require('path'),
	crypto = require('crypto');


const { DiskCache } = require('trilliant');
const ResultCache = new DiskCache(16, 60 * 60 * 1000, path.join(process.cwd(), 'cache'));


function handleError(err, job) {
	//#! fix this
	console.log(JSON.stringify(err));
}


function setParameters(queryDef, params) {
	return queryDef.argmap.map(x => params[x]);
}


async function execJob(job, pool) {
	let sql = job.queryDef.sql;
	let params = setParameters(job.queryDef, job.params);

	console.log(sql);
	console.log(params);
	console.log(job.queryDef.argmap);

	let result = await pool.query(sql, params);
	// add error detection
	job.resultHandler(null, result.rows);
}


function createJob(queryDef, params, callback) {
    let job = {
        queryDef: queryDef,
        params: params || {},
        callback: callback || queryDef.callback
    };

    if(queryDef.cache)
        job.cacheKey = getCacheKey(queryDef.uuid, params);

    return job;
}


function createCallbackQuery(queryDef, pool) {
	return async (obj, optcallback) => {
		const job = createJob(queryDef, obj, optcallback);
		
		if(job.cacheKey) {
			let res = await ResultCache.get(job.cacheKey);
			if(res != null) return job.callback(null, res);
		}

		job.resultHandler = getCallbackHandler(job);
		
		execJob(job, pool);
	};
}


function getCallbackHandler(job) {
	if(!job.callback) job.callback = LAMBDA;
	return (err, rows) => {
        if(err) handleError(err, job);
        else if(job.cacheKey)
			ResultCache.set(job.cacheKey, rows, job.queryDef.cache.expiry);
		return job.callback(err, rows);
	}
}


function createPromiseQuery(queryDef, pool) {
	return obj => {
		return new Promise(async (resolve, reject) => {
			const job = createJob(queryDef, obj, resolve);

			if(job.cacheKey) {
				let res = await ResultCache.get(job.cacheKey);
				if(res != null) return job.callback(res);
			}

			job.reject = reject;
			job.resultHandler = getPromiseHandler(job);
			execJob(job, pool);
		});
	};
}


function getPromiseHandler(job) {
	return (err, rows) => {
		if(err) {
			handleError(err, job);
			return job.reject();
		}

		if(job.cacheKey)
			ResultCache.set(job.cacheKey, rows, job.queryDef.cache.expiry);

		return job.callback(rows);
	}
}


// utility method used to consistently produce the same JSON structures
function getCanonicalJSON(obj) {
	if(typeof obj === 'object') {
		var keys = [];
		// get keys and sort them
		for(var k in obj) keys.push(k);
		keys.sort();
		
		// append each kvp to string
		return '{' + keys.reduce(function(prev, cur, i) {
			return prev + (i>0?',':'') + '"' + cur + '":' + getCanonicalJSON(obj[cur]);
		}, '') + '}';
	} else if(typeof obj === 'function') {
		return 'null';
	} else return JSON.stringify(obj);
}


function getCacheKey(uuid, obj) {
	let hash = crypto.createHash('sha256');
	let cargs = getCanonicalJSON(obj);
	hash.update([uuid, cargs].join('::'));
	return hash.digest('hex');
}


function loadQueries(queryList, baseDir, pool) {
    var queryHash = {};
    
    // default basedir is the one above node_modules
    if(!baseDir) baseDir = path.join(__dirname, '..', '..');
    
    for(var i = 0; i < queryList.length; i++) {
		// assign unique ID for caching
		queryList[i].uuid = crypto.randomUUID();

        // if sql starts with colon, load the query from a file
        if(queryList[i].sql.substr(0,1) == ':')
            queryList[i].sql = fs.readFileSync(path.join(baseDir, queryList[i].sql.substr(1)), 'utf8');
        
        if(!queryList[i].params) queryList[i].params = [];

        // set named parameter mapping
		({sql: queryList[i].sql, pargs: queryList[i].argmap} = getNamedArgMap(queryList[i].sql));
        
        if(queryList[i].usePromise) queryHash[queryList[i].id] = createPromiseQuery(queryList[i], pool);
        else queryHash[queryList[i].id] = createCallbackQuery(queryList[i], pool);
    }
    
    return queryHash;
}


function getNamedArgMap(sql) {
	const RX_PARAM = /@([a-z0-9_]+)/gi;
	const pargs = [];
	sql = sql.replace(RX_PARAM, (w,g,t) => {
		pargs.push(g);
		return `$${pargs.length}`;
	});

	//console.log(pargs);
	return {sql: sql, pargs: pargs};
}



module.exports = {
    loadQueries: loadQueries,

    createCallbackQuery: createCallbackQuery,
    createPromiseQuery: createPromiseQuery
};