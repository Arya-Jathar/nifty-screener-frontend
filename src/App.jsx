import { useState, useEffect } from 'react';

function App() {
  const [selectedStock, setSelectedStock] = useState('');
  const [stockData, setStockData] = useState(null);
  const [capital, setCapital] = useState(100000);
  const [portfolio, setPortfolio] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [livePrices, setLivePrices] = useState({});
  const [darkMode, setDarkMode] = useState(false);
  const NIFTY_50 = [
    "RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS",
    "SBIN.NS", "ITC.NS", "LT.NS", "KOTAKBANK.NS", "HINDUNILVR.NS"
  ];

  useEffect(() => {
    const storedPortfolio = localStorage.getItem('portfolio');
    const storedHistory = localStorage.getItem('tradeHistory');
    const storedCapital = localStorage.getItem('capital');
    const storedDarkMode = localStorage.getItem('darkMode');
    if (storedPortfolio) setPortfolio(JSON.parse(storedPortfolio));
    if (storedHistory) setTradeHistory(JSON.parse(storedHistory));
    if (storedCapital) setCapital(parseFloat(storedCapital));
    if (storedDarkMode) setDarkMode(JSON.parse(storedDarkMode));
  }, []);

  useEffect(() => {
    localStorage.setItem('portfolio', JSON.stringify(portfolio));
    localStorage.setItem('tradeHistory', JSON.stringify(tradeHistory));
    localStorage.setItem('capital', capital.toString());
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [portfolio, tradeHistory, capital, darkMode]);

  useEffect(() => {
    const fetchPrices = async () => {
      if (portfolio.length === 0) return;
      const tickers = portfolio.map(p => p.ticker).join(',');
      try {
        const res = await fetch(`http://127.0.0.1:8000/get_prices?tickers=${tickers}`);
        const data = await res.json();
        setLivePrices(data);
      } catch (err) {
        console.error("Live price fetch error:", err);
      }
    };
    fetchPrices();
  }, [portfolio]);

  const fetchStockData = async () => {
    if (!selectedStock) return alert("Please select a stock!");
    try {
      const res = await fetch(`http://127.0.0.1:8000/get_prices?tickers=${tickers}`);
      const data = await res.json();
      setStockData(data);
    } catch (err) {
      console.error("Fetch error:", err);
    }
  };

  const getSignal = () => {
    if (!stockData) return "none";
    const { rsi, close, ma } = stockData;
    if (rsi<30 || close > ma) return "buy";
    if (rsi>70 || close < ma) return "sell";
    return "none";
  };

  const handleBuy = () => {
    if (!stockData || getSignal() !== 'buy') return;
    const { ticker, close } = stockData;
    const maxInvest = capital * 0.2;
    const quantity = Math.floor(maxInvest / close);
    if (quantity * close < 1000) return alert("Min ₹1000 per trade");
    const cost = quantity * close + 20;
    if (cost > capital) return alert("Insufficient capital");

    const existing = portfolio.find(p => p.ticker === ticker);
    let newPortfolio;
    if (existing) {
      const totalQty = existing.qty + quantity;
      const totalCost = (existing.avgPrice * existing.qty) + (close * quantity);
      const avgPrice = totalCost / totalQty;
      newPortfolio = portfolio.map(p =>
        p.ticker === ticker ? { ...p, qty: totalQty, avgPrice, buyTime: new Date() } : p
      );
    } else {
      newPortfolio = [...portfolio, { ticker, qty: quantity, avgPrice: close, buyTime: new Date() }];
    }
    setPortfolio(newPortfolio);
    setCapital(prev => prev - cost);
    setTradeHistory(prev => [...prev, {
      date: new Date().toLocaleString(),
      ticker,
      action: "Buy",
      qty: quantity,
      price: close,
      commission: 20,
      signal: "BUY",
      pnl: null,
      notes: "Bought based on signal"
    }]);
  };

  const handleExit = (ticker) => {
    const stock = portfolio.find(p => p.ticker === ticker);
    if (!stock || !stockData) return;
    const price = stockData.close;
    const commission = 20;
    const pnl = (price - stock.avgPrice) * stock.qty - commission;
    setCapital(prev => prev + (price * stock.qty - commission));
    setPortfolio(portfolio.filter(p => p.ticker !== ticker));
    setTradeHistory(prev => [...prev, {
      date: new Date().toLocaleString(),
      ticker,
      action: "Exit",
      qty: stock.qty,
      price,
      commission,
      signal: "SELL",
      pnl: pnl.toFixed(2),
      notes: "Exited manually"
    }]);
  };

  const totalUnrealized = portfolio.reduce((acc, stock) => {
    return acc + (livePrices[stock.ticker] ? (livePrices[stock.ticker] - stock.avgPrice) * stock.qty : 0);
  }, 0);

  const realizedPnL = tradeHistory.filter(t => t.action === "Exit").reduce((acc, t) => acc + parseFloat(t.pnl), 0);

  const bestStock = portfolio.reduce((best, stock) => {
    const price = livePrices[stock.ticker] || stock.avgPrice;
    const pnl = (price - stock.avgPrice) * stock.qty;
    return !best || pnl > best.pnl ? { ...stock, pnl } : best;
  }, null);

  const worstStock = portfolio.reduce((worst, stock) => {
    const price = livePrices[stock.ticker] || stock.avgPrice;
    const pnl = (price - stock.avgPrice) * stock.qty;
    return !worst || pnl < worst.pnl ? { ...stock, pnl } : worst;
  }, null);

  const sharpeRatio = (() => {
    const returns = tradeHistory.filter(t => t.action === 'Exit').map(t => parseFloat(t.pnl));
    if (returns.length < 2) return '-';
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(returns.reduce((a, r) => a + Math.pow(r - mean, 2), 0) / (returns.length - 1));
    return std ? (mean / std).toFixed(2) : '-';
  })();

  const maxDrawdown = (() => {
    let capitalPoints = [100000];
    let current = 100000;
    tradeHistory.forEach(trade => {
      if (trade.action === 'Buy') current -= trade.qty * trade.price + 20;
      else current += trade.qty * trade.price - 20;
      capitalPoints.push(current);
    });
    let peak = capitalPoints[0];
    let maxDD = 0;
    capitalPoints.forEach(val => {
      peak = Math.max(peak, val);
      maxDD = Math.max(maxDD, (peak - val) / peak);
    });
    return (maxDD * 100).toFixed(2) + '%';
  })();

  const winRate = (() => {
    const exits = tradeHistory.filter(t => t.action === 'Exit');
    const wins = exits.filter(t => parseFloat(t.pnl) > 0);
    return exits.length ? ((wins.length / exits.length) * 100).toFixed(2) + '%' : '-';
  })();

  // Export functions
  const downloadCSV = (data, filename) => {
    const csvContent = data.map(row => Object.values(row).join(',')).join('\n');
    const header = Object.keys(data[0]).join(',') + '\n';
    const csv = header + csvContent;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportPortfolioCSV = () => {
    if (portfolio.length === 0) return alert('No portfolio data to export');
    const data = portfolio.map(stock => {
      const price = livePrices[stock.ticker] || stock.avgPrice;
      const pnl = ((price - stock.avgPrice) * stock.qty).toFixed(2);
      const percent = ((price - stock.avgPrice) / stock.avgPrice * 100).toFixed(2);
      const days = Math.floor((new Date() - new Date(stock.buyTime)) / (1000 * 60 * 60 * 24));
      return {
        Ticker: stock.ticker,
        Quantity: stock.qty,
        'Average Price': stock.avgPrice,
        'Current Price': price,
        'P&L': pnl,
        'Return %': percent,
        'Days Held': days
      };
    });
    downloadCSV(data, 'portfolio.csv');
  };

  const exportTradeHistoryCSV = () => {
    if (tradeHistory.length === 0) return alert('No trade history to export');
    const data = tradeHistory.map(trade => ({
      Date: trade.date,
      Ticker: trade.ticker,
      Action: trade.action,
      Quantity: trade.qty,
      Price: trade.price,
      Commission: trade.commission,
      Signal: trade.signal,
      'P&L': trade.pnl || '-',
      Notes: trade.notes
    }));
    downloadCSV(data, 'trade_history.csv');
  };

  const exportMetricsCSV = () => {
    const data = [{
      'Total Portfolio Value': (capital + totalUnrealized).toFixed(2),
      'Realized P&L': realizedPnL.toFixed(2),
      'Unrealized P&L': totalUnrealized.toFixed(2),
      'Win Rate': winRate,
      'Sharpe Ratio': sharpeRatio,
      'Max Drawdown': maxDrawdown,
      'Best Stock': bestStock ? `${bestStock.ticker} (${bestStock.pnl.toFixed(2)})` : '-',
      'Worst Stock': worstStock ? `${worstStock.ticker} (${worstStock.pnl.toFixed(2)})` : '-'
    }];
    downloadCSV(data, 'portfolio_metrics.csv');
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      darkMode 
        ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-indigo-900' 
        : 'bg-gradient-to-br from-blue-50 via-white to-indigo-50'
    }`}>
      <div className="w-screen px-6 py-8">
        {/* Header */}
        <div className="text-center mb-8 relative">
          <button
            onClick={toggleDarkMode}
            className={`absolute top-0 right-4 p-3 rounded-full transition-all duration-300 ${
              darkMode 
                ? 'bg-yellow-500 hover:bg-yellow-400 text-gray-900' 
                : 'bg-gray-800 hover:bg-gray-700 text-white'
            }`}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
          <h1 className={`text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2`}>
            Arya's NIFTY 50 Stock Screener
          </h1>
          <p className={`text-lg ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            Virtual Portfolio & Trading System
          </p>
        </div>

        {/* Stock Selection Card */}
        <div className={`rounded-xl shadow-lg p-6 mb-8 border transition-colors duration-300 ${
          darkMode 
            ? 'bg-gray-800 border-gray-700' 
            : 'bg-white border-gray-100'
        }`}>
          <h2 className={`text-2xl font-semibold mb-4 flex items-center ${
            darkMode ? 'text-gray-100' : 'text-gray-800'
          }`}>
             Stock Selection
          </h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <select 
              value={selectedStock} 
              onChange={e => setSelectedStock(e.target.value)}
              className={`flex-1 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-200 ${
                darkMode 
                  ? 'bg-gray-700 border-gray-600 text-gray-100' 
                  : 'bg-white border-gray-300 text-gray-700'
              }`}
            >
              <option value="">-- Select a stock --</option>
              {NIFTY_50.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button 
              onClick={fetchStockData}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium rounded-lg hover:from-blue-600 hover:to-blue-700 transform hover:scale-105 transition-all duration-200 shadow-md hover:shadow-lg"
            >
              Get Stock Data
            </button>
          </div>
        </div>

        {/* Stock Data Card */}
        {stockData && (
          <div className={`rounded-xl shadow-lg p-6 mb-8 border transition-colors duration-300 ${
            darkMode 
              ? 'bg-gray-800 border-gray-700' 
              : 'bg-white border-gray-100'
          }`}>
            <h2 className={`text-2xl font-semibold mb-6 flex items-center ${
              darkMode ? 'text-gray-100' : 'text-gray-800'
            }`}>
               {stockData.ticker}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-lg border border-green-200">
                <p className="text-sm text-green-600 font-medium mb-1">Current Price</p>
                <p className="text-2xl font-bold text-green-700">₹{stockData.close}</p>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-sky-50 p-4 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-600 font-medium mb-1">9-Day MA</p>
                <p className="text-2xl font-bold text-blue-700">₹{stockData.ma}</p>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-violet-50 p-4 rounded-lg border border-purple-200">
                <p className="text-sm text-purple-600 font-medium mb-1">14-Day RSI</p>
                <p className="text-2xl font-bold text-purple-700">{stockData.rsi}</p>
              </div>
            </div>
            <div className="mt-6 flex gap-4">
              {getSignal() === 'buy' && (
                <button 
                  onClick={handleBuy}
                  className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium rounded-lg hover:from-green-600 hover:to-emerald-700 transform hover:scale-105 transition-all duration-200 shadow-md hover:shadow-lg flex items-center gap-2"
                >
                   BUY
                </button>
              )}
              {getSignal() === 'sell' && (
                <button className="px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white font-medium rounded-lg flex items-center gap-2 cursor-not-allowed opacity-75">
                   GOOD TIME TO EXIT IF YOU ALREADY HAVE IT
                </button>
              )}
            </div>
          </div>
        )}

        {/* Portfolio Section */}
        {portfolio.length > 0 && (
          <div className={`rounded-xl shadow-lg p-6 mb-8 border transition-colors duration-300 ${
            darkMode 
              ? 'bg-gray-800 border-gray-700' 
              : 'bg-white border-gray-100'
          }`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className={`text-2xl font-semibold flex items-center ${
                darkMode ? 'text-gray-100' : 'text-gray-800'
              }`}>
                 Portfolio
              </h2>
              <button 
                onClick={exportPortfolioCSV}
                className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white font-medium rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-200 text-sm"
              >
                 Export CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className={`${
                    darkMode 
                      ? 'bg-gradient-to-r from-gray-700 to-gray-600' 
                      : 'bg-gradient-to-r from-gray-50 to-gray-100'
                  }`}>
                    <th className={`px-4 py-3 text-left text-sm font-semibold rounded-tl-lg ${
                      darkMode ? 'text-gray-200' : 'text-gray-700'
                    }`}>Ticker</th>
                    <th className={`px-4 py-3 text-left text-sm font-semibold ${
                      darkMode ? 'text-gray-200' : 'text-gray-700'
                    }`}>Qty</th>
                    <th className={`px-4 py-3 text-left text-sm font-semibold ${
                      darkMode ? 'text-gray-200' : 'text-gray-700'
                    }`}>Avg Price</th>
                    <th className={`px-4 py-3 text-left text-sm font-semibold ${
                      darkMode ? 'text-gray-200' : 'text-gray-700'
                    }`}>Curr Price</th>
                    <th className={`px-4 py-3 text-left text-sm font-semibold ${
                      darkMode ? 'text-gray-200' : 'text-gray-700'
                    }`}>P&L</th>
                    <th className={`px-4 py-3 text-left text-sm font-semibold ${
                      darkMode ? 'text-gray-200' : 'text-gray-700'
                    }`}>% Return</th>
                    <th className={`px-4 py-3 text-left text-sm font-semibold ${
                      darkMode ? 'text-gray-200' : 'text-gray-700'
                    }`}>Days Held</th>
                    <th className={`px-4 py-3 text-left text-sm font-semibold rounded-tr-lg ${
                      darkMode ? 'text-gray-200' : 'text-gray-700'
                    }`}>Exit</th>
                  </tr>
                </thead>
                <tbody className={`${darkMode ? 'divide-gray-600' : 'divide-gray-200'} divide-y`}>
                  {portfolio.map((stock, index) => {
                    const price = livePrices[stock.ticker];
                    const pnl = price ? ((price - stock.avgPrice) * stock.qty).toFixed(2) : '-';
                    const percent = price ? `${((price - stock.avgPrice) / stock.avgPrice * 100).toFixed(2)}%` : '-';
                    const days = Math.floor((new Date() - new Date(stock.buyTime)) / (1000 * 60 * 60 * 24));
                    const isProfit = price && (price - stock.avgPrice) > 0;
                    
                    return (
                      <tr key={stock.ticker} className={`transition-colors duration-150 ${
                        darkMode 
                          ? `hover:bg-gray-700 ${index % 2 === 0 ? 'bg-gray-800' : 'bg-gray-750'}` 
                          : `hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-25'}`
                      }`}>
                        <td className={`px-4 py-3 font-medium ${
                          darkMode ? 'text-gray-100' : 'text-gray-900'
                        }`}>{stock.ticker}</td>
                        <td className={`px-4 py-3 ${
                          darkMode ? 'text-gray-300' : 'text-gray-700'
                        }`}>{stock.qty}</td>
                        <td className={`px-4 py-3 ${
                          darkMode ? 'text-gray-300' : 'text-gray-700'
                        }`}>₹{stock.avgPrice}</td>
                        <td className={`px-4 py-3 ${
                          darkMode ? 'text-gray-300' : 'text-gray-700'
                        }`}>{price ? `₹${price}` : '-'}</td>
                        <td className={`px-4 py-3 font-medium ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                          {pnl !== '-' ? (pnl >= 0 ? '+' : '') + pnl : '-'}
                        </td>
                        <td className={`px-4 py-3 font-medium ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                          {percent}
                        </td>
                        <td className={`px-4 py-3 ${
                          darkMode ? 'text-gray-300' : 'text-gray-700'
                        }`}>{days} day(s)</td>
                        <td className="px-4 py-3">
                          <button 
                            onClick={() => handleExit(stock.ticker)}
                            className="px-3 py-1 bg-gradient-to-r from-red-500 to-red-600 text-white text-sm font-medium rounded hover:from-red-600 hover:to-red-700 transition-all duration-200 transform hover:scale-105"
                          >
                            Exit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Transaction History */}
        {tradeHistory.length > 0 && (
          <div className={`rounded-xl shadow-lg p-6 mb-8 border transition-colors duration-300 ${
            darkMode 
              ? 'bg-gray-800 border-gray-700' 
              : 'bg-white border-gray-100'
          }`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className={`text-2xl font-semibold flex items-center ${
                darkMode ? 'text-gray-100' : 'text-gray-800'
              }`}>
                Transaction History
              </h2>
              <button 
                onClick={exportTradeHistoryCSV}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 text-sm"
              >
                Export CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-50 to-gray-100">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 rounded-tl-lg">Date</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Ticker</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Action</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Qty</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Price</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Commission</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Signal</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">P&L</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 rounded-tr-lg">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {tradeHistory.map((t, i) => (
                    <tr key={i} className={`hover:bg-gray-50 transition-colors duration-150 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-25'}`}>
                      <td className="px-4 py-3 text-gray-700 text-sm">{t.date}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{t.ticker}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          t.action === 'Buy' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {t.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{t.qty}</td>
                      <td className="px-4 py-3 text-gray-700">₹{t.price}</td>
                      <td className="px-4 py-3 text-gray-700">₹{t.commission}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          t.signal === 'BUY' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
                        }`}>
                          {t.signal}
                        </span>
                      </td>
                      <td className={`px-4 py-3 font-medium ${
                        t.pnl && parseFloat(t.pnl) >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {t.pnl ? `₹${t.pnl}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-sm">{t.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Portfolio Metrics */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
          <h2 className="text-2xl font-semibold text-gray-800 mb-6 flex items-center">
            📈 Portfolio Metrics
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-gradient-to-br from-blue-50 to-sky-50 p-4 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-600 font-medium mb-1">Total Portfolio Value</p>
              <p className="text-xl font-bold text-blue-700">₹{(capital + totalUnrealized).toFixed(2)}</p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-lg border border-green-200">
              <p className="text-sm text-green-600 font-medium mb-1">Realized P&L</p>
              <p className={`text-xl font-bold ${realizedPnL >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                ₹{realizedPnL.toFixed(2)}
              </p>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-violet-50 p-4 rounded-lg border border-purple-200">
              <p className="text-sm text-purple-600 font-medium mb-1">Unrealized P&L</p>
              <p className={`text-xl font-bold ${totalUnrealized >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                ₹{totalUnrealized.toFixed(2)}
              </p>
            </div>
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 p-4 rounded-lg border border-orange-200">
              <p className="text-sm text-orange-600 font-medium mb-1">Win Rate</p>
              <p className="text-xl font-bold text-orange-700">{winRate}</p>
            </div>
            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-4 rounded-lg border border-indigo-200">
              <p className="text-sm text-indigo-600 font-medium mb-1">Sharpe Ratio</p>
              <p className="text-xl font-bold text-indigo-700">{sharpeRatio}</p>
            </div>
            <div className="bg-gradient-to-br from-red-50 to-rose-50 p-4 rounded-lg border border-red-200">
              <p className="text-sm text-red-600 font-medium mb-1">Max Drawdown</p>
              <p className="text-xl font-bold text-red-700">{maxDrawdown}</p>
            </div>
            <div className="bg-gradient-to-br from-teal-50 to-cyan-50 p-4 rounded-lg border border-teal-200">
              <p className="text-sm text-teal-600 font-medium mb-1">Best Stock</p>
              <p className="text-lg font-bold text-teal-700">
                {bestStock ? `${bestStock.ticker} (₹${bestStock.pnl.toFixed(2)})` : '-'}
              </p>
            </div>
            <div className="bg-gradient-to-br from-pink-50 to-rose-50 p-4 rounded-lg border border-pink-200">
              <p className="text-sm text-pink-600 font-medium mb-1">Worst Stock</p>
              <p className="text-lg font-bold text-pink-700">
                {worstStock ? `${worstStock.ticker} (₹${worstStock.pnl.toFixed(2)})` : '-'}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
  
      </div>
    </div>
  );
}

export default App;
