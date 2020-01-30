const moment = require('moment');
const fs = require('fs');
const { getCompanyList, processList, saveEntities } = require('./lib/list');
const commandLineArgs = require('command-line-args');

const optionDefinitions = [
    { name: 'country', alias: 'c', type: String }
];
const args = commandLineArgs(optionDefinitions);
let entities = {
    companies: [],
    persons: [],
    memberships: []
}

getCompanyList(args.country)
.then( (results) => {
    if(results.hasOwnProperty('status')) {
        console.log(results.results);
        process.exit(1);
    }
    if(results.hasOwnProperty('companies')) {
        // Ya está todo procesado
        entities.companies = results.companies;
        return [{
            persons: results.persons,
            memberships: results.memberships
        }]
    }
    else {
        // Solo se ha procesado la lista de empresas
        entities.companies = results;
        return processList(args.country, entities.companies);
    }
} )
.then( (response) => {
    if(response.length > 0) {
        response.map( (r) => {
            if(r.hasOwnProperty('persons') && r.persons.length > 0) {
                entities.persons.push(...r.persons);
            }
            if(r.hasOwnProperty('memberships') && r.memberships.length > 0) {
                entities.memberships.push(...r.memberships);
            }
        } );
    }

    // console.log( JSON.stringify(entities, null, 4) );
    console.log('Writing documents...');
    saveEntities(entities, args.country);
    console.log('DONE');
} );
