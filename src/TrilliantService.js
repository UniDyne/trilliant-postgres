const
    fs = require("fs"),
    path = require("path");
const {Pool} = require('pg');

const { loadQueries } = require('./QueryJobs');

module.exports = class TrilliantService extends ServiceWrapper {
    #pool;

    constructor(app, config) {
        super(app, config);

        this.#pool = new Pool(config);
    }

    start() { }
    stop() {
        (async () => await this.#pool.end())();
    }

    register(plug, data) {
        let q;

        if(typeof data === "string")
            q = JSON.parse( fs.readFileSync(path.join(plug.homeDir, data)) );
        else q = data;

        plug.Queries = loadQueries(q, plug.homeDir, this);
    }

    getConnection() {
        return this.#pool;
    }

    loadQueries(q, homeDir) {
        return loadQueries(q, homeDir, this);
    }
};