const moment = require('moment');
const fs = require('fs');
const { getCompanyList, processList } = require('./lib/list');
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
.then( (companies) => {
    if(companies) {
        entities.companies = companies;
        return processList(args.country, entities.companies);
    }
    else {
        console.log('ERROR');
    }
} )
.then( (response) => {
    if(response.length > 0) {
        response.map( (persons) => {
            entities.persons.push(...persons);
        } )
    }

    console.log( JSON.stringify(entities, null, 4) )
    console.log('DONE!');
} );
