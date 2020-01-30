const puppeteer = require("puppeteer");
const laundry = require('company-laundry');
const bolsa = 'Bolsa de Valores de El Salvador S.A. de C.V.';

async function getList() {
    const listURL = 'https://www.bolsadevalores.com.sv/index.php/participantes-del-mercado/emisores/directorio?limit=500&limitstart=0';
    console.log('Getting list...');

    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.goto(listURL, { waitUntil: 'networkidle0', timeout: 0 });
        await page.waitForSelector('div.item');

        let table = await page.$$eval('div.item', divs => divs.map((div, i) => {
            let title = div.querySelector('div.ic-info > a');
            let url = title.getAttribute('href');
            let name = title.querySelector('h4.ic-ititle').textContent.trim();
            let data = Array.from(div.querySelectorAll('p'));
            let description = '';
            let phone = '';
            let website = '';

            if(data.length > 0) {
                data.map( (p) => {
                    let text = p.textContent.trim();
                    if(text.match(/^Descripción/)) description = text.replace('Descripción:', '').trim();
                    if(text.match(/^Contacto/)) phone = text.replace('Contacto:', '').trim();
                    if(p.querySelector('a')) {
                        website = p.querySelector('a').getAttribute('href');
                    }
                } );
            }

            return { url, name, description, phone, website };
        }));

        let companies = [];
        let bolsaCompany = {
            id: laundry.simpleName(laundry.launder(bolsa)),
            name: bolsa,
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
        companies.push(bolsaCompany);

        table.map( (row) => {
            companies.push( buildCompany(row) );
        } );

        await browser.close();
        return companies;
    }
    catch (err) {
        console.log(err);
        await browser.close();
        return { status: 'error', results: err };
    }
}

function buildCompany(row) {
    let company = {
        id: laundry.simpleName(laundry.launder(row.name)),
        name: row.name,
        classification: 'company',
        area: [{
            id: 'sv',
            name: 'SV',
            classification: 'country'
        }],
        links: [ { id: 'https://www.bolsadevalores.com.sv' + row.url } ]
    }

    if(row.description) {
        company.abstract = row.description;
    }
    if(row.phone) {
        company.contact_details = [];
        company.contact_details.push({
            "type": "voice",
            "label": "Primary telephone number",
            "value": row.phone
        });
    }
    if(row.website) {
        company.links.push({id: row.website});
    }

    return company;
}

async function getDetails(company) {
    const companyURL = company.links[0].id;

    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.goto(companyURL, { waitUntil: 'networkidle0', timeout: 0 });
        await page.waitForSelector('div.i-content');

        let textos = await page.$$eval('.ic-info > div', divs => divs.map( div => {
            return div.textContent.trim();
        } ));
        if(textos.length > 0)
            company.description = textos.join(' ');

        let datos = await page.$$eval('.ic-info > p, .ic-info > legend', ps => ps.map( p => {
            return p.textContent;
        } ));

        let consejeres = [];
        let memberships = [];
        let content = processContent(datos, company);
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
    }

}

function processContent(data, company) {
    let consejeres = [];
    let memberships = [];
    let consejeresFound = false;

    for(let i=0; i<data.length; i++) {
        if(consejeresFound) {
            let parts = data[i].split(' : ');
            let consejereID = laundry.simpleName(laundry.launder(parts[1]));
            let consejere = {
                id: consejereID,
                name: parts[1],
                area: [{
                    id: 'sv',
                    name: 'SV',
                    classification: 'country'
                }]
            }
            consejeres.push(consejere);

            let memberID = company.id + '_' + consejereID + '-bm';
            let membership = {
                id: memberID,
                role: "Boardmember",
                organization_id: company.id,
                organization_name: company.name,
                organization_class: "company",
                parent_id: consejereID,
                parent_name: parts[1],
                parent_class: "person",
                title: parts[0]
            }
            memberships.push(membership);

            // Memberships de persona a bolsa
            let personStockMemberID = laundry.simpleName(laundry.launder(bolsa)) + '_' + consejereID + '-se';
            let personStockMembership = {
                id: personStockMemberID,
                role: "Consejero de Emisor de Acciones",
                person_id: consejereID,
                person_name: parts[1],
                parent_id: laundry.simpleName(laundry.launder(bolsa)),
                parent_name: bolsa,
                parent_class: "company",
                parent_subclass: "stock-exchange"
            }
            memberships.push(personStockMembership);
        }
        else {
            if(data[i].match('Rubro:')) {
                let rubro = data[i].replace('Rubro:').trim();
                company.subclassification = rubro;
            }
            else if(data[i].match('Dirección:')) {
                let direccion = data[i].replace('Dirección:').trim();
                if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
                company.contact_details.push({
                    "type": "office",
                    "label": "Primary address",
                    "value": direccion
                });
            }
            if(data[i] == 'Junta Directiva') consejeresFound = true;
        }
    }

    return {
        persons: consejeres,
        memberships: memberships
    }
}

module.exports = { getList, getDetails }
