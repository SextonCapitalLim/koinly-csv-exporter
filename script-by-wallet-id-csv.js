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
            const response = await fetch(`https://api.koinly.io/api/wallets/${encodeURIComponent(walletID)}`, requestOptions);
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
            const response = await fetch(`https://api.koinly.io/api/transactions?order=date&q[m]=and&q[g][0][from_wallet_id_or_to_wallet_id_eq]=${encodeURIComponent(walletID)}&page=${pageNumber}&per_page=${PAGE_COUNT}`, requestOptions);
            return response.json();
        } catch(err) {
            console.error(err)
            throw new Error(`Fetch failed for page=${pageNumber}`)
        }
    }

    const getAllTransactions = async (walletID) => {
        const firstPage = await fetchPage(1, walletID);
        const totalPages = (firstPage && firstPage.meta && firstPage.meta.page && Number(firstPage.meta.page.total_pages)) || 1;
        const promises = [];
        for (let i=2; i <= totalPages; i++) {
            promises.push(fetchPage(i, walletID));
        }
        const remainingPages = promises.length ? await Promise.all(promises) : [];
        const allPages = [firstPage, ...remainingPages].filter(Boolean);
        return allPages.flatMap(it => (it && Array.isArray(it.transactions)) ? it.transactions : []);
    }

    const toCSVFile = (walletName, baseCurrency, transactions) => {  
        // Helper: CSV-safe cell value (quote and escape)
        const csvCell = (val) => {
            if (val === null || val === undefined) return '""';
            const str = String(val)
                .replace(/\r\n/g, '\n')
                .replace(/\r/g, '\n');
            const escaped = str.replace(/"/g, '""');
            return `"${escaped}"`;
        }

        // Helper: sanitize filename for cross-OS compatibility
        const sanitizeFileName = (name) => {
            const fallback = 'Transactions';
            if (!name || !String(name).trim()) return fallback;
            const normalized = (String(name).normalize ? String(name).normalize('NFKD') : String(name));
            const replaced = normalized
                .replace(/[\\/:*?"<>|]/g, ' ')
                .replace(/[\u0000-\u001F\u007F]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            const truncated = replaced.slice(0, 150) || fallback;
            return truncated;
        }

        // Headings (quoted for safety)
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
            'contract_address',
            'from.currency.token_address',
            'from.wallet.display_address',
            'to.currency.token_address',
			'to.wallet.display_address',
			'fee_value',
        ];

        const safeBaseCurrency = baseCurrency || '';
        const rows = Array.isArray(transactions) ? transactions : [];
        const transactionRows = rows.map((t) => {
            const row = [
                t && t.date ? t.date : '',
                t && t.from && t.from.amount ? t.from.amount : '',
                t && t.from && t.from.currency && t.from.currency.symbol ? t.from.currency.symbol : '',
                t && t.to && t.to.amount ? t.to.amount : '',
                t && t.to && t.to.currency && t.to.currency.symbol ? t.to.currency.symbol : '',
                t && t.fee && t.fee.amount ? t.fee.amount : '',
                t && t.fee && t.fee.currency && t.fee.currency.symbol ? t.fee.currency.symbol : '',
                t && t.net_value ? t.net_value : '',
                safeBaseCurrency,
                t && t.type ? t.type : '',
                t && t.description ? t.description : '',
                t && t.txhash ? t.txhash : '',
                t && t.contract_address ? t.contract_address : '',
                t && t.from && t.from.currency && t.from.currency.token_address ? t.from.currency.token_address : '',
                t && t.from && t.from.wallet && t.from.wallet.display_address ? t.from.wallet.display_address : '',
                t && t.to && t.to.currency && t.to.currency.token_address ? t.to.currency.token_address : '',
				t && t.to && t.to.wallet && t.to.wallet.display_address ? t.to.wallet.display_address : '',
				t && t.fee_value ? t.fee_value : '',
            ];
            return row.map(csvCell).join(',');
        });

        const csv = [
            headings.map(csvCell).join(','),
            ...transactionRows
        ].join('\n');

        // Use Blob for robust downloads (avoids data URI length/encoding issues)
        const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sanitizeFileName(walletName)} - Transactions.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    // (debug helper removed)

    const run = async () => {
        const walletID = (prompt('Enter Koinly Wallet ID to export') || '').trim();
        if (!walletID) {
            alert('No wallet ID provided. Export cancelled.');
            return;
        }

        let baseCurrency = '';
        try {
            const session = await fetchSession();
            baseCurrency = (session && session.portfolios && session.portfolios[0] && session.portfolios[0].base_currency && session.portfolios[0].base_currency.symbol) || '';
        } catch (e) {
            console.warn('Could not fetch session/base currency; proceeding with empty base currency.');
        }

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

        let transactions = [];
        try {
            transactions = await getAllTransactions(walletID);
        } catch (e) {
            console.error(e);
            alert('Failed to fetch transactions. A CSV with only headers will be downloaded.');
        }
		// debug logs removed
        toCSVFile(walletName, baseCurrency, Array.isArray(transactions) ? transactions : []);
    }

    run()
})()
