const
    fs = require("fs"),
    path = require("path");
const {Pool} = require('pg');
const {ServiceWrapper} = require('trilliant');
const { loadQueries } = require('./QueryJobs');

module.exports = class PostgresService extends ServiceWrapper {
    #pool;

    constructor(app, config) {
        super(app, config);

        if(typeof config === "string")
            config = JSON.parse(fs.readFileSync(path.join(app.Env.appPath, config), "utf8"));

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

        plug.Queries = this.loadQueries(q, plug.homeDir);
    }

    getConnection() {
        return this.#pool;
    }

    loadQueries(q, homeDir) {
        return loadQueries(q, homeDir, this.#pool);
    }
};