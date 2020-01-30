const puppeteer = require("puppeteer");
const laundry = require('company-laundry');
const bolsa = 'Bolsa de Valores de Lima S.A.A.';

async function getList() {
    const listURL = 'https://www.bvl.com.pe/mercempresas.html';
    console.log('Getting list...');

    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.goto(listURL, { waitUntil: 'load', timeout:0 });
        await page.waitForSelector('#divTabla_Empresas table.Listado');

        let list = await page.$$eval('#divTabla_Empresas table.Listado tr td a', links => links.map(link => {
            let nombre = link.textContent;
            let url = link.getAttribute('href');

            return {nombre, url};
        }));

        let companies = [];
        let bolsaCompany = {
            id: laundry.simpleName(laundry.launder(bolsa)),
            name: bolsa,
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
    let nombre = row.nombre;
    let url = row.url;

    let company = {
        id: laundry.simpleName(laundry.launder(nombre)),
        name: nombre,
        classification: 'company',
        area: [{
            id: 'pe',
            name: 'PE',
            classification: 'country'
        }],
        links: [ { id: 'https://www.bvl.com.pe' + url } ]
    }

    return company;
}

async function getDetails(company) {
    const companyURL = company.links[0].id;

    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.goto(companyURL, { waitUntil: 'networkidle0', timeout: 0 });
        await page.waitForSelector('div.divBloque');

        let data = await page.$$eval('div.divBloque', divs => divs.map( (div, i) => {
            switch(i) {
                case 0:
                    let rows = Array.from(div.querySelectorAll('table tr'));
                    return rows.map((row, j) => {
                        switch(j) {
                            case 0:
                                const tds0 = [...row.getElementsByTagName('td')];
                                return tds0.map( (td, k) => { if(k == 4) return td.textContent.trim() } );
                            case 1:
                                const tds1 = [...row.getElementsByTagName('td')];
                                return tds1.map( (td, k) => { if(k == 1 || k == 3) return td.textContent.trim() } );
                            case 2:
                                const tds2 = [...row.getElementsByTagName('td')];
                                return tds2.map( (td, k) => { if(k == 1 || k == 3) return td.textContent.trim() } );
                        }
                    });
                case 1:
                    return div.textContent;
                case 2:
                    let rows2 = Array.from(div.querySelectorAll('table tr'));
                    let consejeres = [];
                    rows2.map((row, j) => {
                        if(j == 0) return null;
                        consejeres[j] = [];
                        const tds3 = [...row.getElementsByTagName('td')];
                        tds3.map( (td, k) => { if(k == 0 || k == 1) consejeres[j][k] = td.textContent.trim() } );
                    });
                    return consejeres;
            }
        } ));

        let consejeres = [];
        let memberships = [];
        let content = processContent(data, company);

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

function processContent(data, company) {
    let consejeres = [];
    let memberships = [];

    data.map( (row, i) => {
        switch(i) {
            case 0:
                row.map( (item, j) => {
                    switch(j) {
                        case 0:
                            if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
                            company.contact_details.push({
                                "type": "voice",
                                "label": "Fax number",
                                "value": item[4]
                            });
                            break;
                        case 1:
                            if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
                            company.contact_details.push({
                                "type": "office",
                                "label": "Primary address",
                                "value": item[1]
                            });
                            company.links.push({id: item[3]});
                            break;
                        case 2:
                            if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
                            company.contact_details.push({
                                "type": "voice",
                                "label": "Primary telephone number",
                                "value": item[1]
                            });
                            company.founding_date = item[3];
                            break;
                    }
                } );
                break;
            case 1:
                company.description = row;
                break;
            case 2:
                row.map( (item) => {
                    if(item != null) {
                        let consejereID = laundry.simpleName(laundry.launder(item[0]));
                        consejeres.push({
                            id: consejereID,
                            name: item[0],
                            area: [{
                                id: 'pe',
                                name: 'PE',
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
                            parent_name: item[0],
                            parent_class: "person",
                            title: item[1]
                        }
                        memberships.push(membership);

                        // Memberships de persona a bolsa
                        let personStockMemberID = laundry.simpleName(laundry.launder(bolsa)) + '_' + consejereID + '-se';
                        let personStockMembership = {
                            id: personStockMemberID,
                            role: "Consejero de Emisor de Acciones",
                            person_id: consejereID,
                            person_name: item[0],
                            parent_id: laundry.simpleName(laundry.launder(bolsa)),
                            parent_name: bolsa,
                            parent_class: "company",
                            parent_subclass: "stock-exchange"
                        }
                        memberships.push(personStockMembership);
                    }
                } );
                break;
        }
    } );

    return {
        persons: consejeres,
        memberships: memberships
    };
}

module.exports = { getList, getDetails }
