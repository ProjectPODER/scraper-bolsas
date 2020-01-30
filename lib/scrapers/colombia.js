const puppeteer = require("puppeteer");
const laundry = require('company-laundry');
const bolsa = 'Bolsa de Valores de Colombia';

async function getList() {
    const listURL = 'https://www.bvc.com.co/pps/tibco/portalbvc/Home/Empresas/Listado+de+Emisores';
    console.log('Getting list...');

    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.goto(listURL, { waitUntil: 'networkidle0' });
        await page.waitForSelector('#texto_16');
        await page.$eval('#texto_16 a', button => button.click() );
        await page.waitForSelector('#texto_28');

        let allTables = [];
        // Procesar la primera página antes de seguir los links de paginación
        console.log('Getting page 1');
        let table = await getPage(page);
        allTables.push(...table)

        let pagination = await page.$$('#texto_37 a');
        let numPages = pagination.length;
        let currentPage = 2;

        for(let i=0; i<numPages; i++) {
            console.log('Getting page ' + currentPage); // Empieza en 0, ya procesamos la 1, i+2 es la página 2
            currentPage++;
            await pagination[i].click();
            await page.waitForSelector('#texto_28');
            table = await getPage(page);
            allTables.push(...table);

            // Obtener la paginación de nuevo porque se pierde el contexto al hacer click...
            pagination = await page.$$('#texto_37 a');
            if(i == 0) i++; // Si estamos en el primer link, la siguiente vez evitamos el link de regresar a la primera página
        }

        let companies = [];
        let bolsaCompany = {
            id: laundry.simpleName(laundry.launder(bolsa)),
            name: bolsa,
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
        companies.push(bolsaCompany);

        allTables.map( (row) => {
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

async function getPage(browserPage) {
    return browserPage.$$eval('#texto_28 tbody tr', trs => trs.map((tr, j) => {
        const tds = [...tr.getElementsByTagName('td')];
        return tds.map((td, i) => {
            switch(i) {
                case 0:
                    return td.querySelector('a').getAttribute('href');
                case 1:
                case 2:
                case 3:
                case 4:
                    return td.textContent.trim();
            }
        });
    }));
}

function buildCompany(row) {
    let url = 'https://www.bvc.com.co' + row[0];
    let name = row[1];
    let founding_year = row[2];
    let sector = row[3];
    let city = row[4];

    let company = {
        id: laundry.simpleName(laundry.launder(name)),
        name: name,
        classification: 'company',
        subclassification: sector,
        founding_date: founding_year,
        area: [{
            id: 'co',
            name: 'CO',
            classification: 'country'
        }],
        links: [ { id: url } ]
    }

    if(city != '') {
        company.area.push({
            id: laundry.simpleName(laundry.launder(city)),
            name: city,
            classification: 'city'
        });
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
        await page.goto(companyURL, {waitUntil: 'load', timeout: 60000});
        await page.waitForSelector('#texto_18', { timeout: 60000 });

        let website = await page.$eval('#texto_18 > tbody:nth-child(1) > tr:nth-child(1) > td:nth-child(1) > table:nth-child(1) > tbody:nth-child(1) > tr:nth-child(2) > td:nth-child(2) > a:nth-child(1)', e => e.innerHTML.trim());
        let direccion = await page.$eval('#texto_18 > tbody:nth-child(1) > tr:nth-child(1) > td:nth-child(1) > table:nth-child(1) > tbody:nth-child(1) > tr:nth-child(3) > td:nth-child(2)', e => e.innerHTML.trim());
        let telefono = await page.$eval('#texto_18 > tbody:nth-child(1) > tr:nth-child(1) > td:nth-child(1) > table:nth-child(1) > tbody:nth-child(1) > tr:nth-child(2) > td:nth-child(4)', e => e.innerHTML.trim());
        let fax = await page.$eval('#texto_18 > tbody:nth-child(1) > tr:nth-child(1) > td:nth-child(1) > table:nth-child(1) > tbody:nth-child(1) > tr:nth-child(3) > td:nth-child(4)', e => e.innerHTML.trim());
        let siglas = await page.$eval('#texto_18 > tbody:nth-child(1) > tr:nth-child(2) > td:nth-child(2)', e => e.innerHTML.trim());
        let nit = await page.$eval('#texto_18 > tbody:nth-child(1) > tr:nth-child(3) > td:nth-child(2)', e => e.innerHTML.trim());
        let fecha_inscripcion = await page.$eval('#texto_18 > tbody:nth-child(1) > tr:nth-child(5) > td:nth-child(4)', e => e.innerHTML.trim());

        if(website) company.links.push({id:website});
        if(direccion) {
            if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
            company.contact_details.push({
                "type": "office",
                "label": "Primary address",
                "value": direccion
            });
        }
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
        if(siglas) {
            if(!company.hasOwnProperty('identifiers')) company.identifiers = [];
            company.identifiers.push({
                identifier: siglas,
                scheme: 'BVC'
            });
        }
        if(nit) {
            if(!company.hasOwnProperty('identifiers')) company.identifiers = [];
            company.identifiers.push({
                identifier: nit,
                scheme: 'NIT'
            });
        }
        if(fecha_inscripcion) company.founding_date = fecha_inscripcion;

        let additionalURL = await page.$eval('.listado_emisor_detalle_reporte_analistas > a', e => e.href);
        if(additionalURL == 'https://www.bvc.com.co/pps/tibco/portalbvc/Home/Empresas/Listado+de+Emisores') {
            // No hay consejeres...
            console.log('Junta not found...');
            await browser.close();
            return {
                persons: consejeres,
                memberships: memberships
            }
        }
        else if(additionalURL.match('lServicio=Publicaciones')) {
            // ej: https://www.superfinanciera.gov.co/jsp/loader.jsf?lServicio=Publicaciones&lTipo=publicaciones&lFuncion=loadContenidoPublicacion&id=80102
            additionalURL = 'https://www.superfinanciera.gov.co/Superfinanciera-Simev/generic/FinancialInstitutionSimevList.seam?nationalRecordId=1&financialInstitutionStateRNVEIId=1';
            await page.goto(additionalURL, {waitUntil: 'load', timeout: 60000});
            await page.waitForSelector('#financialInstitutionSearch\\:j_id15\\:name');
            await page.$eval('#financialInstitutionSearch\\:j_id15\\:name', (el, company_name) => el.value = company_name, company.name);
            await page.$eval('#financialInstitutionSearch\\:search', button => button.click() );
            await page.waitForSelector('#resultForm\\:financialInstitutionSimevList tr');
            additionalURL = await page.$eval('#resultForm\\:financialInstitutionSimevList\\:0\\:financialInstitutionViewId', e => e.href);
        }

        await page.goto(additionalURL, {waitUntil: 'load', timeout: 60000});
        if(!page.$('.footerSimev > a')) {
            console.log('Link for board not found...');
            return {
                persons: consejeres,
                memberships: memberships
            }
        }
        await page.$eval('div.footerSimev:nth-child(5) > a:nth-child(2)', button => button.click());
        await page.waitForSelector('#collapsiblePanelJuntaDirectiva\\:content', { timeout:60000 });

        if(!page.$('#listaJuntaDirectiva')) {
            console.log('Junta directiva not found...');
            return {
                persons: consejeres,
                memberships: memberships
            }
        }
        let table = await page.$$eval('#listaJuntaDirectiva tbody tr.rf-dt-r', trs => trs.map((tr, j) => {
            const tds = [...tr.getElementsByTagName('td')];
            return tds.map((td, i) => { return td.textContent.trim() } );
        }));

        table.map( (row) => {
            let consejereID = laundry.simpleName(laundry.launder(row[2]));
            let consejere = {
                id: consejereID,
                name: row[2],
                identifiers: [{
                    identifier: row[1],
                    scheme: row[0]
                }],
                area: [{
                    id: 'co',
                    name: 'CO',
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
                parent_name: row[2],
                parent_class: "person",
                title: row[3],
                start_date: row[5]
            }
            if(row[6]) membership.end_date = row[6];
            memberships.push(membership);

            // Memberships de persona a bolsa
            let personStockMemberID = laundry.simpleName(laundry.launder(bolsa)) + '_' + consejereID + '-se';
            let personStockMembership = {
                id: personStockMemberID,
                role: "Consejero de Emisor de Acciones",
                person_id: consejereID,
                person_name: row[2],
                parent_id: laundry.simpleName(laundry.launder(bolsa)),
                parent_name: bolsa,
                parent_class: "company",
                parent_subclass: "stock-exchange"
            }
            memberships.push(personStockMembership);
        } );

        await page.waitFor(5000); // Esperar 5 segundos antes del siguiente porque este sitio se rompe
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

module.exports = { getList, getDetails }
