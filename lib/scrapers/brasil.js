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
    const mainURL = 'http://bvmf.bmfbovespa.com.br/cias-listadas/empresas-listadas/ResumoEmpresaPrincipal.aspx?codigoCvm=' + company.id + '&idioma=pt-br';
    const companyURL = 'http://bvmf.bmfbovespa.com.br/cias-listadas/empresas-listadas/ResumoDemonstrativosFinanceiros.aspx?codigoCvm=' + company.id + '&idioma=pt-br';
    const consejeresBaseURL = 'http://www2.bmfbovespa.com.br/dxw/FormDetalheIANG2CmpCnsAdmDir.asp?';
    const infoBaseURL = 'http://www2.bmfbovespa.com.br/dxw/FrDXW.asp?';

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
        await page.goto(companyURL, {waitUntil: 'networkidle0', timeout: 0});

        // await page.waitForSelector('#ctl00_contentPlaceHolderConteudo_MenuEmpresasListadas1_tabMenuEmpresa_tabRelatoriosFinanceiros');
        // await page.$eval('#ctl00_contentPlaceHolderConteudo_MenuEmpresasListadas1_tabMenuEmpresa_tabRelatoriosFinanceiros', button => button.click() );
        // console.log('clicked link');
        await page.waitForSelector('#ctl00_contentPlaceHolderConteudo_rptDocumentosIAN_ctl00_lnkDocumento');

        let link = await page.evaluate(() => {
            return document.querySelector('#ctl00_contentPlaceHolderConteudo_rptDocumentosIAN_ctl00_lnkDocumento').getAttribute('href');
        });
        link = link.replace("javascript:ConsultarDXW('", "").replace("')", "").split('?')[1];
        console.log(link);

        // Conseguir detalles de la empresa, comentado porque causa demasiados timeouts
        // await page.goto(infoBaseURL + link, {waitUntil: 'load', timeout: 0});
        // await page.waitForSelector("html > frameset > frame:nth-child(2)");
        // const elementHandle = await page.$('html > frameset > frame:nth-child(2)');
        // const frame = await elementHandle.contentFrame();
        // await frame.waitForSelector('body > center:nth-child(1) > table:nth-child(1) > tbody:nth-child(1) > tr:nth-child(1) > td:nth-child(1) > table:nth-child(1) > tbody:nth-child(1) > tr:nth-child(3) > td:nth-child(1) > font:nth-child(1) > a:nth-child(2)');
        // await frame.$eval('body > center:nth-child(1) > table:nth-child(1) > tbody:nth-child(1) > tr:nth-child(1) > td:nth-child(1) > table:nth-child(1) > tbody:nth-child(1) > tr:nth-child(3) > td:nth-child(1) > font:nth-child(1) > a:nth-child(2)', button => button.click() );
        // await frame.waitForSelector('body > center:nth-child(1) > table:nth-child(1) > tbody:nth-child(1) > tr:nth-child(2) > td:nth-child(1) > table:nth-child(2) > tbody:nth-child(1) > tr:nth-child(1) > td:nth-child(1)');

        // Conseguir consejeres
        console.log('Getting consejeres...');
        await page.goto(consejeresBaseURL + link, {waitUntil: 'load', timeout: 0});
        console.log('Page loaded...');
        await page.waitForSelector('.ScrollMaker table');
        console.log('Document loaded!');
        await page.$$eval('.ScrollMaker table tr', trs => trs.map((tr, j) => {
            if(j == 0) return;
            const tds = [...tr.getElementsByTagName('td')];
            return tds.map((td, i) => {
                return td.textContent.trim();
            });
        }));

        table.map( (row) => {
            let consejereID = laundry.simpleName(laundry.launder(row[1]));
            let consejere = {
                id: consejereID,
                name: row[1],
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
            consejeres.push(consejere);

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
                title: row[8],
                start_date: row[5]
            }
            memberships.push(membership);

            // Memberships de persona a bolsa
            let personStockMemberID = laundry.simpleName(laundry.launder(bolsa)) + '_' + consejereID + '-se';
            let personStockMembership = {
                id: personStockMemberID,
                role: "Consejero de Emisor de Acciones",
                person_id: consejereID,
                person_name: row[1],
                parent_id: laundry.simpleName(laundry.launder(bolsa)),
                parent_name: bolsa,
                parent_class: "company",
                parent_subclass: "stock-exchange"
            }
            memberships.push(personStockMembership);
        } );
    }
    catch(e) {
        console.log('ERROR...', company.name);
        console.log(e);
        return {
            persons: consejeres,
            memberships: memberships
        }
    }

    await browser.close();

    return {
        persons: consejeres,
        memberships: memberships
    }
}

module.exports = { getList, getDetails }
