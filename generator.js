const laundry = require('company-laundry');
const commandLineArgs = require('command-line-args');
const fs = require('fs');

const optionDefinitions = [
    { name: 'country', alias: 'c', type: String },
    { name: 'company', alias: 'o', type: String },
    { name: 'name', alias: 'n', type: String },
    { name: 'title', alias: 't', type: String }
];
const args = commandLineArgs(optionDefinitions);

let bolsas = getBolsas();
if( !bolsas.hasOwnProperty(args.country.toUpperCase()) ) {
    console.log('ERROR: country ' + args.country + ' is not recognized.');
    process.exit(1);
}
let bolsa = bolsas[args.country.toUpperCase()];

// Create person
let consejereID = laundry.simpleName(laundry.launder(args.name));
let consejereName = args.name;
let consejereTitle = args.title;
let consejere = {
    id: consejereID,
    name: consejereName,
    area: [{
        id: args.country.toLowerCase(),
        name: args.country.toUpperCase(),
        classification: 'country'
    }]
}

// Create company membership
let companyID = laundry.simpleName(laundry.launder(args.company));
let companyName = args.company;
let memberID = companyID + '_' + consejereID + '-bm';
let membership = {
    id: memberID,
    role: "Boardmember",
    organization_id: companyID,
    organization_name: companyName,
    organization_class: "company",
    parent_id: consejereID,
    parent_name: consejereName,
    parent_class: "person",
    title: consejereTitle
}

// Create stock-exchange membership
let personStockMemberID = bolsa.id + '_' + consejereID + '-se';
let personStockMembership = {
    id: personStockMemberID,
    role: "Consejero de Emisor de Acciones",
    person_id: consejereID,
    person_name: consejereName,
    parent_id: laundry.simpleName(laundry.launder(bolsa.id)),
    parent_name: bolsa.name,
    parent_class: "company",
    parent_subclass: "stock-exchange"
}

let metadata = {
    source: [ {'id': 'mujeres2020'} ],
    sourceRun: [ {'id': 'mujeres2020-' + Date.now()} ],
    date: new Date().toISOString()
}
Object.assign(consejere, metadata);
Object.assign(membership, metadata);
Object.assign(personStockMembership, metadata);

fs.appendFileSync('./data/extra-persons.json', JSON.stringify(consejere) + '\n', 'utf8');
fs.appendFileSync('./data/extra-memberships.json', JSON.stringify(membership) + '\n', 'utf8');
fs.appendFileSync('./data/extra-memberships.json', JSON.stringify(personStockMembership) + '\n', 'utf8');

// console.log( JSON.stringify(consejere) );
// console.log( JSON.stringify(membership) );
// console.log( JSON.stringify(personStockMembership) );

process.exit(0);

// -----------------------------------------------------------------------------

function getBolsas() {
    let bolsas = [];

    bolsas['AR'] = {
        id: laundry.simpleName(laundry.launder('Bolsa de Comercio de Buenos Aires')),
        name: 'Bolsa de Comercio de Buenos Aires',
        other_names: [{name:'BOLSAR'}],
        classification: 'company',
        subclassification: 'stock-exchange',
        area: [{
            id: 'ar',
            name: 'AR',
            classification: 'country'
        }],
        links: [{id:'https://www.bolsar.com'}]
    }
    bolsas['BO'] = {
        id: laundry.simpleName(laundry.launder('Bolsa Boliviana de Valores S.A.')),
        name: 'Bolsa Boliviana de Valores S.A.',
        other_names: [{name:'BBV'}],
        classification: 'company',
        subclassification: 'stock-exchange',
        area: [{
            id: 'bo',
            name: 'BO',
            classification: 'country'
        }],
        links: [{id: 'https://www.bbv.com.bo'}]
    }
    bolsas['BR'] = {
        id: laundry.simpleName(laundry.launder('Brasil Bolsa Balcão')),
        name: 'Brasil Bolsa Balcão',
        other_names: [{name:'B3'}],
        classification: 'company',
        subclassification: 'stock-exchange',
        area: [{
            id: 'br',
            name: 'BR',
            classification: 'country'
        }],
        links: [{id: 'http://www.b3.com.br'}]
    }
    bolsas['CL'] = {
        id: laundry.simpleName(laundry.launder('Comisión para el Mercado Financiero')),
        name: 'Comisión para el Mercado Financiero',
        other_names: [{name:'CMF'}],
        classification: 'company',
        subclassification: 'stock-exchange',
        area: [{
            id: 'cl',
            name: 'CL',
            classification: 'country'
        }],
        links: [{id: 'http://www.cmfchile.cl'}]
    }
    bolsas['CO'] = {
        id: laundry.simpleName(laundry.launder('Bolsa de Valores de Colombia')),
        name: 'Bolsa de Valores de Colombia',
        other_names: [{name:'BVC'}],
        classification: 'company',
        subclassification: 'stock-exchange',
        area: [{
            id: 'co',
            name: 'CO',
            classification: 'country'
        }],
        links: [{id: 'https://www.bvc.com.co'}]
    }
    bolsas['CR'] = {
        id: laundry.simpleName(laundry.launder('Bolsa Nacional de Valores')),
        name: 'Bolsa Nacional de Valores',
        other_names: [{name:'BNV'}],
        classification: 'company',
        subclassification: 'stock-exchange',
        area: [{
            id: 'cr',
            name: 'CR',
            classification: 'country'
        }],
        links: [{id: 'https://www.bolsacr.com'}]
    }
    bolsas['SV'] = {
        id: laundry.simpleName(laundry.launder('Bolsa de Valores de El Salvador S.A. de C.V.')),
        name: 'Bolsa de Valores de El Salvador S.A. de C.V.',
        other_names: [{name:'BVES'}],
        classification: 'company',
        subclassification: 'stock-exchange',
        area: [{
            id: 'sv',
            name: 'SV',
            classification: 'country'
        }],
        links: [{id: 'https://www.bolsadevalores.com.sv'}]
    }
    bolsas['MX'] = {
        id: laundry.simpleName(laundry.launder('Bolsa Mexicana de Valores')),
        name: 'Bolsa Mexicana de Valores',
        other_names: [{name: 'BMV'}],
        classification: 'company',
        subclassification: 'stock-exchange',
        area: [{
            id: 'mx',
            name: 'MX',
            classification: "country"
        }],
        links: [{id: 'https://www.bmv.com.mx'}]
    }
    bolsas['PA'] = {
        id: laundry.simpleName(laundry.launder('Bolsa de Valores de Panamá')),
        name: 'Bolsa de Valores de Panamá',
        other_names: [{name: 'BVPA'}],
        classification: 'company',
        subclassification: 'stock-exchange',
        area: [{
            id: 'pa',
            name: 'PA',
            classification: "country"
        }],
        links: [{id: 'https://www.panabolsa.com'}]
    }
    bolsas['PY'] = {
        id: laundry.simpleName(laundry.launder('Bolsa de Valores y Productos de Asunción S.A.')),
        name: 'Bolsa de Valores y Productos de Asunción S.A.',
        other_names: [{name: 'BVPASA'}],
        classification: 'company',
        subclassification: 'stock-exchange',
        area: [{
            id: 'py',
            name: 'PY',
            classification: "country"
        }],
        links: [{id: 'http://www.bvpasa.com.py'}]
    }
    bolsas['PE'] = {
        id: laundry.simpleName(laundry.launder('Bolsa de Valores de Lima S.A.A.')),
        name: 'Bolsa de Valores de Lima S.A.A.',
        other_names: [{name: 'BVL'}],
        classification: 'company',
        subclassification: 'stock-exchange',
        area: [{
            id: 'pe',
            name: 'PE',
            classification: "country"
        }],
        links: [{id: 'https://www.bvl.com.pe'}]
    }
    bolsas['UY'] = {
        id: laundry.simpleName(laundry.launder('Bolsa de Valores de Montevideo')),
        name: 'Bolsa de Valores de Montevideo',
        other_names: [{name:'BVM'}],
        classification: 'company',
        subclassification: 'stock-exchange',
        area: [{
            id: 'uy',
            name: 'UY',
            classification: 'country'
        }],
        links: [{id: 'https://www.bvm.com.uy'}]
    }
    bolsas['ES'] = {
        id: laundry.simpleName(laundry.launder('Comisión Nacional del Mercado de Valores')),
        name: 'Comisión Nacional del Mercado de Valores',
        other_names: [{name:'CNMV'}],
        classification: 'company',
        subclassification: 'stock-exchange',
        area: [{
            id: 'es',
            name: 'ES',
            classification: 'country'
        }],
        links: [{id: 'https://www.cnmv.es'}]
    }
    bolsas['EC'] = {
        id: laundry.simpleName(laundry.launder('Bolsa de Valores de Guayaquil')),
        name: 'Bolsa de Valores de Guayaquil',
        other_names: [{name:'BVG'}],
        classification: 'company',
        subclassification: 'stock-exchange',
        area: [{
            id: 'ec',
            name: 'EC',
            classification: 'country'
        }],
        links: [{id: 'https://www.bolsadevaloresguayaquil.com'}]
    }
    bolsas['NI'] = {
        id: laundry.simpleName(laundry.launder('Bolsa de Valores de Nicaragua')),
        name: 'Bolsa de Valores de Nicaragua',
        other_names: [{name:'BVN'}],
        classification: 'company',
        subclassification: 'stock-exchange',
        area: [{
            id: 'ni',
            name: 'NI',
            classification: 'country'
        }],
        links: [{id: 'https://www.bolsanic.com'}]
    }
    bolsas['GT'] = {
        id: laundry.simpleName(laundry.launder('Bolsa de Valores Nacional de Guatemala')),
        name: 'Bolsa de Valores Nacional de Guatemala',
        other_names: [{name:'BVN'}],
        classification: 'company',
        subclassification: 'stock-exchange',
        area: [{
            id: 'gt',
            name: 'GT',
            classification: 'country'
        }],
        links: [{id: 'https://www.bvnsa.com.gt'}]
    }

    return bolsas;
}
