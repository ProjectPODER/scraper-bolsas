const puppeteer = require("puppeteer");
const laundry = require('company-laundry');
const bolsa = 'Bolsa de Valores y Productos de Asunción S.A.';

async function getList() {
    const listURL = 'http://www.bvpasa.com.py/emisores.php';
    console.log('Getting list...');

    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.goto(listURL, { waitUntil: 'load', timeout:0 });
        await page.waitForSelector('#tableEmisores');

        let list = await page.$$eval('#tableEmisores tbody tr', trs => trs.map(tr => {
            const tds = [...tr.getElementsByTagName('td')];
            return tds.map((td, i) => {
                switch(i) {
                    case 0:
                    case 1:
                    case 2:
                        return td.textContent.trim();
                    case 3:
                        return td.querySelector('a').getAttribute('href');
                }
            })
        }));

        let companies = [];
        let bolsaCompany = {
            id: laundry.simpleName(laundry.launder(bolsa)),
            name: bolsa,
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
        companies.push(bolsaCompany);

        list.map( (item) => {
            companies.push( buildCompany(item) );
        } );

        await browser.close();
        return companies;
    }
    catch (err) {
        console.log(err);
        return { status: 'error', results: err };
    }
}

function buildCompany(row) {
    let codigo = row[0];
    let nombre = row[1];
    let rubro = row[2];
    let url = row[3];

    let company = {
        id: laundry.simpleName(laundry.launder(nombre)),
        name: nombre,
        classification: 'company',
        area: [{
            id: 'py',
            name: 'PY',
            classification: 'country'
        }],
        links: [ { id: 'http://www.bvpasa.com.py/' + url } ]
    }

    return company;
}

async function getDetails(company) {
    const companyURL = company.links[0].id;
    let consejeres = [];
    let memberships = [];

    // Membership de empresa a bolsa
    let companyStockMemberID = laundry.simpleName(laundry.launder(bolsa)) + '_' + company.id + '-se';
    let companyStockMembership = {
        id: companyStockMemberID,
        role: "Emisor de Acciones",
        organization_id: company.id,
        organization_name: company.name,
        organization_class: "company",
        parent_id: laundry.simpleName(laundry.launder(bolsa)),
        parent_name: bolsa,
        parent_class: "company",
        parent_subclass: "stock-exchange"
    }
    memberships.push(companyStockMembership);

    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.goto(companyURL, { waitUntil: 'networkidle0', timeout: 0 });
        await page.waitForSelector('table.table:nth-child(1)');

        let data = await page.$$eval('table.table:nth-child(1) tr', trs => trs.map( (tr, i) => {
            if(i > 2) {
                const tds = [...tr.getElementsByTagName('td')];
                return tds.map(td => { return td.textContent.trim() })
            }
        } ));

        let content = processContent(data, company);
        
        consejeres.push(...content.persons);
        memberships.push(...content.memberships);

        await browser.close();
        return {
            persons: consejeres,
            memberships: memberships
        }
    }
    catch(e) {
        console.log(e);
        await browser.close();
        return {
            persons: consejeres,
            memberships: memberships
        }
    }
}

function processContent(data, company) {
    let consejeres = [];
    let memberships = [];

    data.map( (row, i) => {
        if(row != null) {
            switch(row[0]) {
                case 'Actividad:':
                    company.description = row[1];
                    break;
                case 'Sector:':
                    company.subclassification = row[1];
                    break;
                case 'Código:':
                    company.identifiers = [];
                    company.identifiers.push({
                        identifier: row[1],
                        scheme: 'BVPASA'
                    });
                    break;
                case 'Dirección:':
                    if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
                    company.contact_details.push({
                        "type": "office",
                        "label": "Primary address",
                        "value": row[1]
                    });
                    break;
                case 'Teléfono:':
                    if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
                    company.contact_details.push({
                        "type": "voice",
                        "label": "Primary telephone number",
                        "value": row[1]
                    });
                    break;
                case 'Fax:':
                    if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
                    company.contact_details.push({
                        "type": "voice",
                        "label": "Fax number",
                        "value": row[1]
                    });
                    break;
                case 'e-mail:':
                    if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
                    company.contact_details.push({
                        "type": "email",
                        "label": "Primary email address",
                        "value": row[1]
                    });
                    break;
                case 'Presidente:':
                case 'Presidente Ejecutivo:':
                    let nombreConsejere = row[1].replace(/Arq\.|Dr\.|Sr\.|Sra\.|Eco\.|Econ\.|Ing\.|Lic\./ig, '').trim();
                    let consejereID = laundry.simpleName(laundry.launder(nombreConsejere));
                    consejeres.push({
                        id: consejereID,
                        name: nombreConsejere,
                        area: [{
                            id: 'py',
                            name: 'PY',
                            classification: 'country'
                        }]
                    });

                    let memberID = company.id + '_' + consejereID + '-bm';
                    let membership = {
                        id: memberID,
                        role: "Boardmember",
                        organization_id: company.id,
                        organization_name: company.name,
                        organization_class: "company",
                        parent_id: consejereID,
                        parent_name: row[1],
                        parent_class: "person",
                        title: 'Presidente'
                    }
                    memberships.push(membership);

                    // Memberships de persona a bolsa
                    let personStockMemberID = laundry.simpleName(laundry.launder(bolsa)) + '_' + consejereID + '-se';
                    let personStockMembership = {
                        id: personStockMemberID,
                        role: "Consejero de Emisor de Acciones",
                        person_id: consejereID,
                        person_name: nombreConsejere,
                        parent_id: laundry.simpleName(laundry.launder(bolsa)),
                        parent_name: bolsa,
                        parent_class: "company",
                        parent_subclass: "stock-exchange"
                    }
                    memberships.push(personStockMembership);
                    break;
            }
        }
    } );

    return {
        persons: consejeres,
        memberships: memberships
    };
}

module.exports = { getList, getDetails }
