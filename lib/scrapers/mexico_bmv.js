const puppeteer = require("puppeteer");
const laundry = require('company-laundry');
const bolsa = 'Bolsa Mexicana de Valores';

async function getList() {
    const listURL = 'https://www.bmv.com.mx/es/emisoras/informacion-de-emisoras';
    console.log('Getting list...');

    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.goto(listURL, { waitUntil: 'load', timeout:0 });
        await page.waitForSelector('#btnSearch');

        await page.$eval('#btnSearch', button => button.click() );
        await page.waitForSelector('#boxResults');

        let allTables = [];

        let list = await page.$$eval('#boxResults table.tableGeneral tbody tr', trs => trs.map(tr => {
            const tds = [...tr.getElementsByTagName('td')];
            return tds.map((td, i) => {
                switch(i) {
                    case 0:
                        let siglas = td.textContent;
                        let url = td.querySelector('a').getAttribute('href');
                        return { siglas, url };
                    case 1:
                        return td.textContent;
                }
            });
        }));

        let companies = [];
        let bolsaCompany = {
            id: laundry.simpleName(laundry.launder(bolsa)),
            name: bolsa,
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
        companies.push(bolsaCompany);

        list.map( (category) => {
            category.map( (item) => {
                companies.push( buildCompany(item) );
            } );
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
    let nombre = row.nombre;
    let url = row.url;
    let sector = row.sector;

    let company = {
        id: laundry.simpleName(laundry.launder(nombre)),
        name: nombre,
        classification: 'company',
        subclassification: sector,
        area: [
            {
                id: 'mx',
                name: 'MX',
                classification: 'country'
            }
        ],
        links: [ { id: url } ]
    }

    return company;
}

async function getDetails(company) {
    const companyURL = company.links[0].id;

    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.goto(companyURL, { waitUntil: 'networkidle0', timeout: 0 });

        let rows = await page.$$eval('table.info-emisor td > table tr', trs => trs.map( (tr, j) => {
            const tds = [...tr.getElementsByTagName('td')];
            return tds.map((td, i) => {
                return td.textContent.trim();
            });
        } ));

        let consejeres = [];
        let memberships = [];

        let content = processContent(rows, company);
        consejeres = content.persons;
        memberships = content.memberships;

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
            persons: [],
            memberships: []
        }
    }
}

function processContent(rows, company) {
    let consejeres = [];
    let memberships = [];

    rows.map(row => {
        let consejereID = laundry.simpleName(laundry.launder(row[0]));
        let consejere = {
            id: consejereID,
            name: row[0],
            area: [{
                id: 'mx',
                name: 'MX',
                classification: 'country'
            }]
        }
        consejeres.push(consejere);

        // Membership de persona a empresa
        let memberID = company.id + '_' + consejereID + '-bm';
        let membership = {
            id: memberID,
            role: "Boardmember",
            organization_id: company.id,
            organization_name: company.name,
            organization_class: "company",
            parent_id: consejereID,
            parent_name: row[0],
            parent_class: "person",
            title: row[1]
        }
        memberships.push(membership);

        // Memberships de persona a bolsa
        let personStockMemberID = laundry.simpleName(laundry.launder(bolsa)) + '_' + consejereID + '-se';
        let personStockMembership = {
            id: personStockMemberID,
            role: "Consejero de Emisor de Acciones",
            person_id: consejereID,
            person_name: row[0],
            parent_id: laundry.simpleName(laundry.launder(bolsa)),
            parent_name: bolsa,
            parent_class: "company",
            parent_subclass: "stock-exchange"
        }
        memberships.push(personStockMembership);
    });

    return {
        persons: consejeres,
        memberships: memberships
    };
}

module.exports = { getList, getDetails }
