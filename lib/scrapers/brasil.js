const puppeteer = require("puppeteer");
const laundry = require('company-laundry');
const bolsa = 'Brasil Bolsa Balcão';

async function getList() {
    const listURL = 'http://bvmf.bmfbovespa.com.br/cias-listadas/empresas-listadas/BuscaEmpresaListada.aspx?idioma=pt-br';
    console.log('Getting list...');

    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.goto(listURL, { waitUntil: 'networkidle0' });
        await page.waitForSelector('#ctl00_contentPlaceHolderConteudo_BuscaNomeEmpresa1_btnTodas');

        await page.$eval('#ctl00_contentPlaceHolderConteudo_BuscaNomeEmpresa1_btnTodas', button => button.click() );
        await page.waitForSelector('tr.GridRow_SiteBmfBovespa');

        let table = await page.$$eval('tr.GridRow_SiteBmfBovespa', trs => trs.map(tr => {
            const tds = [...tr.getElementsByTagName('td')];
            return tds.map((td, i) => {
                switch(i) {
                    case 0:
                        let nombre = td.textContent;
                        let url = td.querySelector('a').getAttribute('href');
                        let id = url.split('codigoCvm=')[1];
                        return { nombre, url, id };
                    case 1:
                    case 2:
                        return td.textContent;
                }
            });
        }));

        let companies = [];
        let bolsaCompany = {
            id: laundry.simpleName(laundry.launder(bolsa)),
            name: bolsa,
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
        companies.push(bolsaCompany);

        table.map( (row) => {
            companies.push({
                id: laundry.simpleName(laundry.launder(row[0].nombre)),
                name: row[0].nombre,
                classification: 'company',
                subclassification: expandClassification(row[2]),
                area: [{
                    id: 'br',
                    name: 'BR',
                    classification: 'country'
                }],
                identifiers: [
                    {
                        identifier: row[1],
                        scheme: 'B3'
                    },
                    {
                        identifier: row[0].id,
                        scheme: 'CVM'
                    }
                ],
                links: [ { id: 'http://bvmf.bmfbovespa.com.br/cias-listadas/empresas-listadas/' + row[0].url } ]
            });
        } );

        await browser.close();
        return companies;
    }
    catch (err) {
        return { status: 'error', results: err };
    }
}

function expandClassification(string) {
    switch(string) {
        case 'NM':
            return 'Cia. Novo Mercado';
        case 'N1':
            return 'Cia. Nível 1 de Governança Corporativa';
        case 'N2':
            return 'Cia. Nível 2 de Governança Corporativa';
        case 'MA':
            return 'Cia. Bovespa Mais';
        case 'M2':
            return 'Cia. Bovespa Mais Nível 2';
        case 'MB':
            return 'Cia. Balcão Org. Tradicional';
        case 'DR1':
            return 'BDR Nível 1';
        case 'DR2':
            return 'BDR Nível 2';
        case 'DR3':
            return 'BDR Nível 3';
        case 'DRN':
            return 'BDR Não Patrocinado';
    }
}

async function getDetails(company) {
    const cvm = company.identifiers.filter( id => id.scheme == 'CVM' );
    const baseURL = 'http://bvmf.bmfbovespa.com.br/cias-listadas/empresas-listadas/ResumoDemonstrativosFinanceiros.aspx?codigoCvm=' + cvm[0].identifier + '&idioma=en-us';
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
        console.log('Trying to get details...');

        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        // await page.setRequestInterception(true);
        // page.on('request', request => {
        //   if (request.isNavigationRequest() && request.redirectChain().length)
        //     request.abort();
        //   else
        //     request.continue();
        // });
        await page.goto(baseURL, {waitUntil: 'networkidle0', timeout: 0});
        await page.waitForSelector('#ctl00_contentPlaceHolderConteudo_rptDocumentosFRE_ctl00_lnkDocumento');
        let link = await page.evaluate(() => {
            return document.querySelector('#ctl00_contentPlaceHolderConteudo_rptDocumentosFRE_ctl00_lnkDocumento').getAttribute('href');
        });
        link = link.replace("javascript:AbreFormularioCadastral('", "").replace("')", "");

        // Conseguir consejeres
        await page.goto(link, {waitUntil: 'load', timeout: 0});
        await page.waitForSelector('#cmbGrupo');
        await page.select('#cmbGrupo', '866');
        await page.waitFor(5000); // Darle tiempo para que cargue el popup y se oculte
        await page.waitForSelector('#cmbQuadro');

        const value = await page.evaluate(() => {
            return document.querySelector('#cmbQuadro option:nth-child(5)').value
        });
        await page.select('#cmbQuadro', value);
        await page.waitFor(5000); // Darle tiempo para que cargue el popup y se oculte

        const elementHandle = await page.$('iframe#iFrameFormulariosFilho');
        const childFrame = await elementHandle.contentFrame();
        await childFrame.waitForSelector('#tbDados');

        let table = await childFrame.$$eval('#tbDados > tr', trs => trs.map((tr, j) => {
            const tds = [...tr.getElementsByTagName('td')];
            return tds.map((td, i) => {
                if(j % 2 == 0) {
                    return td.textContent.trim();
                }
                else {
                    if(i == 1) {
                        let innerRows = Array.from(td.querySelectorAll('#tabelaDadosCompanhia > tbody > tr'));
                        let data = [];
                        innerRows.map(row => {
                            let innerCells = [...row.getElementsByTagName('td')];
                            innerCells.map(cell => data.push(cell.textContent.trim()));
                        });
                        return data;
                    }
                }
            });
        }));

        let content = processTable(table, company);
        consejeres.push(...content.persons);
        memberships.push(...content.memberships);
    }
    catch(e) {
        console.log('ERROR...', company.name);
        console.log(e);
        return {
            persons: consejeres,
            memberships: memberships
        }
    }

    await page.waitFor(5000);
    await browser.close();

    return {
        persons: consejeres,
        memberships: memberships
    }
}

function processTable(table, company) {
    let consejeres = [];
    let memberships = [];

    for(let i=0; i<table.length; i++) {
        let row = table[i];
        let consejereID = laundry.simpleName(laundry.launder(row[1]));
        let consejereName = row[1];
        let role_parts = row[3].split(' - ');
        let consejereRole = role_parts[role_parts.length - 1];
        let consejereRoleID = laundry.simpleName(laundry.launder(consejereRole));

        let consejere = {
            id: consejereID,
            name: consejereName,
            identifiers: [{
                identifier: row[2],
                scheme: 'CPF'
            }],
            area: [{
                id: 'br',
                name: 'BR',
                classification: 'country'
            }]
        }

        i++;
        row = table[i][1];
        let j = 0;
        let consejereStartDate = '';
        while(j < row.length) {
            switch(row[j]) {
                case 'Data da eleição:':
                    j++;
                    consejereStartDate = row[j];
                    break;
            }
            j++;
        }
        consejeres.push(consejere);

        let memberID = company.id + '_' + consejereID + '-' + consejereRoleID;
        let membership = {
            id: memberID,
            role: "Boardmember",
            organization_id: company.id,
            organization_name: company.name,
            organization_class: "company",
            parent_id: consejereID,
            parent_name: consejereName,
            parent_class: "person",
            title: consejereRole,
            start_date: consejereStartDate
        }
        memberships.push(membership);

        // Memberships de persona a bolsa
        let personStockMemberID = laundry.simpleName(laundry.launder(bolsa)) + '_' + consejereID + '-se';
        let personStockMembership = {
            id: personStockMemberID,
            role: "Consejero de Emisor de Acciones",
            person_id: consejereID,
            person_name: consejereName,
            parent_id: laundry.simpleName(laundry.launder(bolsa)),
            parent_name: bolsa,
            parent_class: "company",
            parent_subclass: "stock-exchange"
        }
        memberships.push(personStockMembership);
    }

    return { persons: consejeres, memberships: memberships }
}

module.exports = { getList, getDetails }
