const puppeteer = require("puppeteer");
const laundry = require('company-laundry');
const bolsa = 'Bolsa de Valores de Panamá';

async function getList() {
    const listURL = 'https://www.panabolsa.com/es/emisores/clasificacion-de-emisores/';
    console.log('Getting list...');

    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.goto(listURL, { waitUntil: 'load', timeout:0 });
        await page.waitForSelector('div.divSectorCont');

        let allTables = [];

        let list = await page.$$eval('div.divSectorCont', divs => divs.map(div => {
            let sector = div.getAttribute('id').replace('sector-', '').replace('-', ' ');
            let words = sector.split(' ');
            let ucwords = [];
            words.map(word => {
                ucwords.push(word.charAt(0).toUpperCase() + word.slice(1))
            });
            sector = ucwords.join(' ');

            let empresas = Array.from(div.querySelectorAll('div.single-emisor'));
            let itemList = [];
            empresas.map(e => {
                let item = e.querySelector('a');
                itemList.push({
                    nombre: item.textContent,
                    url: item.getAttribute('href'),
                    sector: sector
                })
            });
            return itemList;
        }));

        let companies = [];
        let bolsaCompany = {
            id: laundry.simpleName(laundry.launder(bolsa)),
            name: bolsa,
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
                id: 'pa',
                name: 'PA',
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
        await page.waitForSelector('div#tabs');

        let textos = await page.$$eval('table.info-emisor td > div', divs => divs.map( (div, i) => {
            switch(i) {
                case 0:
                case 1:
                case 3:
                case 4:
                    return div.textContent;
            }
        } ));

        if(textos[0]) {
            company.identifiers = [{
                identifier: textos[0].replace('Ticker:', ''),
                scheme: 'BVPA'
            }];
        }
        if(textos[1]) {
            company.description = textos[1].replace('Descripción: ', '');
        }
        if(textos[3]) {
            if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
            company.contact_details.push({
                "type": "office",
                "label": "Primary address",
                "value": textos[3]
            });
        }
        if(textos[4]) {
            let values = textos[4].split('\n').join('');
            values = values.split(/Teléfono:|Fax:|Sitio Web:/g);

            let telefono = values[1].trim();
            let fax = values[2].trim();
            let website = values[3].trim();

            if(telefono) {
                if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
                company.contact_details.push({
                    "type": "voice",
                    "label": "Primary telephone number",
                    "value": telefono
                });
            }
            if(fax) {
                if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
                company.contact_details.push({
                    "type": "voice",
                    "label": "Fax number",
                    "value": fax
                });
            }
            if(website) {
                let url = website.replace(/(<([^>]+)>)/ig);
                company.links.push({id:url});
            }
        }

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
                id: 'pa',
                name: 'PA',
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
