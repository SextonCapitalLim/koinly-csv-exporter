(function() {
    const PAGE_COUNT = 25;

    const getCookie = (name) => {
        const cookies = document.cookie.split('; ');
        const cookieMap = cookies.map(it => it.split('='))
            .reduce((prev, curr) => {
                const [key, value] = curr;
                return {
                    ...prev,
                    [key]: value,
                }
            }, {})
        return cookieMap[name]
    }

    const fetchHeaders = () => {
        const headers = new Headers();
        headers.append('authority', 'api.koinly.io');
        headers.append('accept', 'application/json, text/plain, */*');
        headers.append('accept-language', 'en-GB,en-US;q=0.9,en;q=0.8');
        headers.append('access-control-allow-credentials', 'true');
        headers.append('caches-requests', '1');
        headers.append('cookie', document.cookie);
        headers.append('origin', 'https://app.koinly.io');
        headers.append('referer', 'https://app.koinly.io/');
        headers.append('sec-fetch-dest', 'empty');
        headers.append('sec-fetch-mode', 'cors');
        headers.append('sec-fetch-site', 'same-site');
        headers.append('sec-gpc', '1');
        headers.append('user-agent', navigator.userAgent);
        headers.append('x-auth-token', getCookie('API_KEY'));
        headers.append('x-portfolio-token', getCookie('PORTFOLIO_ID'));
        return headers;
    }

    const fetchSession = async () => {
        const requestOptions = {
            method: 'GET',
            headers: fetchHeaders(),
            redirect: 'follow'
        };
        
        try {
            const response = await fetch('https://api.koinly.io/api/sessions', requestOptions);
            return response.json();
        } catch(err) {
            console.error(err)
            throw new Error('Fetch session failed')
        }
    }

    const fetchWalletById = async (walletID) => {
        const requestOptions = {
            method: 'GET',
            headers: fetchHeaders(),
            redirect: 'follow'
        };
        
        try {
            const response = await fetch(`https://api.koinly.io/api/wallets/${walletID}`, requestOptions);
            return response.json();
        } catch(err) {
            console.error(err)
            throw new Error('Fetch wallet failed')
        }
    }

    const fetchPage = async (pageNumber, walletID) => {
        const requestOptions = {
            method: 'GET',
            headers: fetchHeaders(),
            redirect: 'follow'
        };
        
        try {
            const response = await fetch(`https://api.koinly.io/api/transactions?order=date&q[m]=and&q[g][0][from_wallet_id_or_to_wallet_id_eq]=${walletID}&page=${pageNumber}&per_page=${PAGE_COUNT}`, requestOptions);
            return response.json();
        } catch(err) {
            console.error(err)
            throw new Error(`Fetch failed for page=${pageNumber}`)
        }
    }

    const getAllTransactions = async (walletID) => {
        const firstPage = await fetchPage(1, walletID);
        const totalPages = firstPage.meta.page.total_pages;
        const promises = [];
        for (let i=2; i <= totalPages; i++) {
            promises.push(fetchPage(i, walletID));
        }
        const remainingPages = await Promise.all(promises);
        const allPages = [firstPage, ...remainingPages];
        return allPages.flatMap(it => it.transactions);
    }

    const toCSVFile = (walletName, baseCurrency, transactions) => {  
        // Headings
        // Representing Koinly Spreadsheet (https://docs.google.com/spreadsheets/d/1dESkilY70aLlo18P3wqXR_PX1svNyAbkYiAk2tBPJng/edit#gid=0)
        const headings = [
           'Date',
           'Sent Amount',
           'Sent Currency',
           'Received Amount',
           'Received Currency',
           'Fee Amount',
           'Fee Currency',
           'Net Worth Amount',
           'Net Worth Currency',
           'Label',
           'Description',
           'TxHash',
           // EXTRA_HEADERS: Add extra headers as necessary (ensure you also update "row" below)
        ]
        
        const transactionRows = transactions.map((t) => { 
           const row = [
               t.date,
               t.from ? t.from.amount : '',
               t.from ? t.from.currency.symbol : '',
               t.to ? t.to.amount : '',
               t.to ? t.to.currency.symbol : '',
               t.fee ? t.fee.amount : '',
               t.fee ? t.fee.currency.symbol : '',
               t.net_value,
               baseCurrency,
               t.type,
               t.description,
               t.txhash,
               // EXTRA_FIELDS: Add extra fields as necessary (ensure you also update "headings" above)
           ]
           return row.join(',');  
        });
   
        const csv = [
            headings.join(','), 
            ...transactionRows
        ].join('\n');
         
        const hiddenElement = document.createElement('a');
        hiddenElement.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
        hiddenElement.target = '_blank';
        hiddenElement.download = `${walletName} - Transactions.csv`;
        hiddenElement.click();
    }

    const run = async () => {
        const walletID = (prompt('Enter Koinly Wallet ID to export') || '').trim();
        if (!walletID) {
            alert('No wallet ID provided. Export cancelled.');
            return;
        }

        const session = await fetchSession();
        const baseCurrency = session.portfolios[0].base_currency.symbol;

        let walletName = `Wallet ${walletID}`;
        try {
            const walletResponse = await fetchWalletById(walletID);
            // Handle possible response shapes
            const wallet = walletResponse.wallet || walletResponse;
            if (wallet && wallet.name) {
                walletName = wallet.name;
            }
        } catch (e) {
            console.warn('Could not fetch wallet details; proceeding with generic name.');
        }

        const transactions = await getAllTransactions(walletID);
        console.log(`Your Koinly Transactions for wallet ${walletName} (ID: ${walletID})\n`, transactions);
        toCSVFile(walletName, baseCurrency, transactions);
    }

    run()
})()
