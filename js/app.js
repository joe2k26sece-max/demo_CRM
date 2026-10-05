import { firestoreDb } from './firebase-config.js';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Mock Database using LocalStorage synced with Firebase
const db = {
  get(key) { return JSON.parse(localStorage.getItem(key)) || []; },
  set(key, data) { localStorage.setItem(key, JSON.stringify(data)); },
  
  syncFromFirebase() {
    onSnapshot(collection(firestoreDb, 'customers'), (snapshot) => {
      this.set('customers', snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      if (app.currentScreen === 'dashboardScreen') app.loadDashboard();
      if (app.currentScreen === 'customerListScreen') app.loadCustomersList();
      if (app.currentScreen === 'customerDetailScreen') app.loadCustomerDetails();
    }, (err) => alert("Firebase Sync Error (Customers). Check Firebase Security Rules! " + err.message));
    onSnapshot(collection(firestoreDb, 'payments'), (snapshot) => {
      this.set('payments', snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      if (app.currentScreen === 'dashboardScreen') app.loadDashboard();
      if (app.currentScreen === 'customerDetailScreen') app.loadCustomerDetails();
    }, (err) => console.error("Firebase Sync Error (Payments):", err));
    onSnapshot(collection(firestoreDb, 'bills'), (snapshot) => {
      this.set('bills', snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      if (app.currentScreen === 'dashboardScreen') app.loadDashboard();
      if (app.currentScreen === 'customerDetailScreen') app.loadCustomerDetails();
    }, (err) => console.error("Firebase Sync Error (Bills):", err));
  },

  addCustomer(c) {
    const cust = this.get('customers');
    c.id = Date.now().toString();
    c.openingBalance = Number(c.openingBalance) || 0;
    cust.push(c);
    this.set('customers', cust);
    setDoc(doc(firestoreDb, 'customers', c.id), c);
    return c;
  },
  updateCustomer(c) {
    const cust = this.get('customers');
    const idx = cust.findIndex(x => x.id === c.id);
    if (idx !== -1) {
      c.openingBalance = Number(c.openingBalance) || 0;
      cust[idx] = c;
      this.set('customers', cust);
      setDoc(doc(firestoreDb, 'customers', c.id), c);
    }
  },
  deleteCustomer(id) {
    let cust = this.get('customers');
    cust = cust.filter(x => x.id !== id);
    this.set('customers', cust);
    deleteDoc(doc(firestoreDb, 'customers', id)).catch(e => alert("Firebase Delete Error: " + e.message));
    
    let pays = this.get('payments');
    const paysToDelete = pays.filter(x => x.customerId === id);
    pays = pays.filter(x => x.customerId !== id);
    this.set('payments', pays);
    paysToDelete.forEach(p => deleteDoc(doc(firestoreDb, 'payments', p.id)).catch(e => console.error(e)));
    
    let bills = this.get('bills');
    const billsToDelete = bills.filter(x => x.customerId === id);
    bills = bills.filter(x => x.customerId !== id);
    this.set('bills', bills);
    billsToDelete.forEach(b => deleteDoc(doc(firestoreDb, 'bills', b.id)).catch(e => console.error(e)));
  },
  addPayment(p) {
    const pays = this.get('payments');
    p.id = Date.now().toString();
    p.date = new Date().toISOString();
    pays.push(p);
    this.set('payments', pays);
    setDoc(doc(firestoreDb, 'payments', p.id), p);
  },
  addBill(b) {
    const bills = this.get('bills');
    b.id = Date.now().toString();
    b.date = new Date().toISOString();
    bills.push(b);
    this.set('bills', bills);
    setDoc(doc(firestoreDb, 'bills', b.id), b);
  },
  getStats() {
    const custs = this.get('customers');
    const pays = this.get('payments');
    const bills = this.get('bills');
    
    let totalCollected = pays.reduce((sum, p) => sum + Number(p.amount), 0);
    let totalBilled = bills.reduce((sum, b) => sum + Number(b.totalAmount), 0);
    let totalOpeningBalance = custs.reduce((sum, c) => sum + Number(c.openingBalance || 0), 0);
    
    const todayStr = new Date().toISOString().split('T')[0];
    let todayCollected = pays.filter(p => p.date.startsWith(todayStr)).reduce((s, p) => s + Number(p.amount), 0);
    
    let pendingAmount = (totalOpeningBalance + totalBilled) - totalCollected;
    
    return {
      customers: custs.length,
      pending: pendingAmount > 0 ? pendingAmount : 0,
      today: todayCollected,
      month: totalCollected 
    };
  },
  getCustomerBalance(customerId) {
    const c = this.get('customers').find(x => x.id === customerId);
    if (!c) return { totalPaid: 0, totalBilled: 0, balance: 0, openingBalance: 0 };
    
    const openingBalance = Number(c.openingBalance || 0);
    const p = this.get('payments').filter(x => x.customerId === customerId);
    const b = this.get('bills').filter(x => x.customerId === customerId);
    
    const totPaid = p.reduce((s, x) => s + Number(x.amount), 0);
    const totBilled = b.reduce((s, x) => s + Number(x.totalAmount), 0);
    const balance = (openingBalance + totBilled) - totPaid;
    
    return {
      openingBalance,
      totalPaid: totPaid,
      totalBilled: totBilled,
      balance: balance > 0 ? balance : 0,
      rawBalance: balance
    };
  }
};

const app = {
  token: localStorage.getItem('token'),
  currentScreen: 'loginScreen',
  historyStack: [],
  activeCustomerId: null,
  billItemsCount: 1,

  async hashStr(str) {
      // Using a basic hash function instead of crypto.subtle so it works on mobile/HTTP network devices
      let h = 0;
      for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
      return h.toString(16);
  },

  async promptForPassword() {
      const p = prompt("Enter your password to proceed:");
      if (!p) return false;
      const targetHash = await this.hashStr("DEMO"); // Hash for "demo"
      const pHash = await this.hashStr(p.trim().toUpperCase());
      return pHash === targetHash;
  },

  init() {
    this.bindEvents();
    if (this.token) {
      db.syncFromFirebase();
      this.navigate('dashboardScreen');
    } else {
      this.navigate('loginScreen');
    }
  },

  bindEvents() {
    document.getElementById('loginForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLogin();
    });

    document.getElementById('addCustomerForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveCustomer();
    });

    document.getElementById('editCustomerForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.updateCustomerData();
    });

    document.getElementById('addPaymentForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.savePayment();
    });
  },

  navigate(screenId, pushHistory = true) {
    if (pushHistory && this.currentScreen !== screenId && this.currentScreen !== 'loginScreen') {
      this.historyStack.push(this.currentScreen);
    }
    
    document.querySelectorAll('.screen').forEach(el => {
      el.classList.remove('active');
      el.classList.add('hidden');
    });

    const target = document.getElementById(screenId);
    if (target) {
      target.classList.remove('hidden');
      target.classList.add('active');
    }

    this.currentScreen = screenId;
    this.updateLayout();
    this.runScreenLogic(screenId);
  },

  goBack() {
    if (this.historyStack.length > 0) {
      const prev = this.historyStack.pop();
      this.navigate(prev, false);
    } else {
      this.navigate('dashboardScreen', false);
    }
  },

  updateLayout() {
    const topBar = document.getElementById('topBar');
    const bottomNav = document.getElementById('bottomNav');
    const backBtn = document.getElementById('backBtn');
    const loginScreen = document.getElementById('loginScreen');

    if (this.currentScreen === 'loginScreen') {
      topBar.classList.add('hidden');
      bottomNav.classList.add('hidden');
      loginScreen.classList.remove('hidden'); 
    } else {
      topBar.classList.remove('hidden');
      bottomNav.classList.remove('hidden');
      loginScreen.classList.add('hidden');
    }

    if (this.currentScreen !== 'dashboardScreen' && this.currentScreen !== 'loginScreen') {
      backBtn.classList.remove('hidden');
    } else {
      backBtn.classList.add('hidden');
    }

    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.remove('active');
      if (el.getAttribute('onclick').includes(this.currentScreen)) {
        el.classList.add('active');
      }
    });
  },

  runScreenLogic(screenId) {
    if (screenId === 'dashboardScreen') this.renderDashboard();
    if (screenId === 'customerListScreen') this.renderCustomerList();
    if (screenId === 'customerDetailScreen') this.renderCustomerDetail();
    if (screenId === 'addPaymentScreen') document.getElementById('addPaymentForm').reset();
    if (screenId === 'addCustomerScreen') document.getElementById('addCustomerForm').reset();
    if (screenId === 'generateBillScreen') this.initBillScreen();
  },

  async handleLogin() {
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const err = document.getElementById('loginError');
    
    const targetHash = await this.hashStr("DEMO"); // Hash for "demo"
    // Trim spaces and convert to uppercase to make it case-insensitive (like the original code)
    const uHash = await this.hashStr(u.trim().toUpperCase());
    const pHash = await this.hashStr(p.trim().toUpperCase());
    
    if (uHash === targetHash && pHash === targetHash) {
      localStorage.setItem('token', 'valid');
      this.token = 'valid';
      err.classList.add('hidden');
      db.syncFromFirebase();
      this.navigate('dashboardScreen');
    } else {
      err.textContent = "Invalid username or password";
      err.classList.remove('hidden');
    }
  },

  logout() {
    this.token = null;
    localStorage.removeItem('token');
    this.navigate('loginScreen');
  },

  showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    toast.style.display = 'block';
    setTimeout(() => {
      toast.classList.add('hidden');
      toast.style.display = 'none';
    }, 2000);
  },

  renderDashboard() {
    const stats = db.getStats();
    document.getElementById('dashTotalCustomers').textContent = stats.customers;
    document.getElementById('dashPendingAmount').textContent = stats.pending;
    document.getElementById('dashCollectedToday').textContent = stats.today;
    document.getElementById('dashCollectedMonth').textContent = stats.month;

    const list = document.getElementById('recentActivityList');
    const pays = db.get('payments').reverse().slice(0, 5);
    const custs = db.get('customers');
    
    if (pays.length === 0) {
      list.innerHTML = `<div class="card text-center text-muted">No recent activity</div>`;
      return;
    }

    list.innerHTML = pays.map(p => {
      const c = custs.find(cu => cu.id === p.customerId);
      const cName = c ? c.name : 'Unknown';
      const d = new Date(p.date).toLocaleString();
      return `
      <div class="card" style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <p class="font-medium text-white">${cName}</p>
          <p class="text-xs text-muted">Paid via ${p.mode} • ${d}</p>
        </div>
        <div class="text-accent font-bold">+₹${p.amount}</div>
      </div>
      `;
    }).join('');
  },

  renderCustomerList() {
    const search = document.getElementById('customerSearchInput').value.toLowerCase();
    const custs = db.get('customers');
    const list = document.getElementById('customerListContainer');

    const filtered = custs.filter(c => c.name.toLowerCase().includes(search) || c.phone.includes(search));

    if (filtered.length === 0) {
      list.innerHTML = `<p class="text-center text-muted">No customers found</p>`;
      return;
    }

    list.innerHTML = filtered.map(c => {
      const bInfo = db.getCustomerBalance(c.id);
      return `
      <div class="card cursor-pointer" style="display:flex; justify-content:space-between; align-items:center;" onclick="app.openCustomerDetail('${c.id}')">
        <div>
          <p class="font-bold text-white">${c.name}</p>
          <p class="text-xs text-muted">${c.phone}</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-muted">Pending</p>
          <p class="font-bold ${bInfo.balance > 0 ? 'text-danger' : 'text-accent'}">₹${bInfo.balance}</p>
        </div>
      </div>
      `;
    }).join('');
  },

  openCustomerDetail(id) {
    this.activeCustomerId = id;
    this.navigate('customerDetailScreen');
  },

  renderCustomerDetail() {
    if (!this.activeCustomerId) return;
    const c = db.get('customers').find(x => x.id === this.activeCustomerId);
    if (!c) return;

    document.getElementById('detailName').textContent = c.name;
    document.getElementById('detailPhone').textContent = c.phone;

    const bInfo = db.getCustomerBalance(c.id);

    document.getElementById('detailTotalBilled').textContent = '₹' + (bInfo.totalBilled + bInfo.openingBalance);
    document.getElementById('detailBalance').textContent = '₹' + bInfo.balance;

    const p = db.get('payments').filter(x => x.customerId === c.id);
    const b = db.get('bills').filter(x => x.customerId === c.id);

    const history = [...p.map(x => ({...x, type: 'Payment'})), ...b.map(x => ({...x, type: 'Bill'}))];
    history.sort((a,b) => new Date(b.date) - new Date(a.date));

    const histList = document.getElementById('customerHistoryList');
    if (history.length === 0) {
      histList.innerHTML = `<p class="text-muted text-sm text-center">No history available</p>`;
    } else {
      histList.innerHTML = history.map(item => `
        <div class="card" style="display:flex; justify-content:space-between; align-items:center; padding: 10px;">
          <div>
            <p class="text-sm font-bold text-white">${item.type === 'Payment' ? 'Payment ('+item.mode+')' : 'Bill #'+item.id}</p>
            <p class="text-xs text-muted">${new Date(item.date).toLocaleDateString()}</p>
          </div>
          <div class="font-bold ${item.type === 'Payment' ? 'text-accent' : 'text-danger'}">
             ${item.type === 'Payment' ? '+' : '-'}₹${item.amount || item.totalAmount}
          </div>
        </div>
      `).join('');
    }
  },

  saveCustomer() {
    const c = {
      name: document.getElementById('addCustName').value,
      phone: document.getElementById('addCustPhone').value,
      email: document.getElementById('addCustEmail').value,
      address: document.getElementById('addCustAddress').value,
      openingBalance: document.getElementById('addCustOpeningBalance').value || 0
    };
    db.addCustomer(c);

    const paidAmount = Number(document.getElementById('addCustPaidAmount').value || 0);
    if (paidAmount > 0) {
      db.addPayment({
        customerId: c.id,
        amount: paidAmount,
        mode: 'Cash',
        notes: 'Paid during registration'
      });
    }

    this.showToast('Customer saved');
    this.goBack();
  },

  openEditCustomer() {
    if (!this.activeCustomerId) return;
    const c = db.get('customers').find(x => x.id === this.activeCustomerId);
    if (!c) return;
    
    document.getElementById('editCustName').value = c.name || '';
    document.getElementById('editCustPhone').value = c.phone || '';
    document.getElementById('editCustEmail').value = c.email || '';
    document.getElementById('editCustAddress').value = c.address || '';
    document.getElementById('editCustOpeningBalance').value = c.openingBalance || 0;
    
    this.navigate('editCustomerScreen');
  },

  updateCustomerData() {
    if (!this.activeCustomerId) return;
    const c = {
      id: this.activeCustomerId,
      name: document.getElementById('editCustName').value,
      phone: document.getElementById('editCustPhone').value,
      email: document.getElementById('editCustEmail').value,
      address: document.getElementById('editCustAddress').value,
      openingBalance: document.getElementById('editCustOpeningBalance').value || 0
    };
    db.updateCustomer(c);
    this.showToast('Customer updated');
    this.goBack();
  },

  async deleteCustomer() {
    if (!this.activeCustomerId) return;
    if (confirm("Are you sure you want to permanently delete this customer and all their bills/payments?")) {
      const isAuth = await this.promptForPassword();
      if (!isAuth) {
         alert("Incorrect password!");
         return;
      }
      db.deleteCustomer(this.activeCustomerId);
      this.showToast('Customer deleted');
      this.navigate('customerListScreen');
    }
  },

  savePayment() {
    const p = {
      customerId: this.activeCustomerId,
      amount: document.getElementById('payAmount').value,
      mode: document.getElementById('payMode').value,
      notes: document.getElementById('payNotes').value
    };
    db.addPayment(p);
    this.showToast('Payment saved');
    this.goBack();
  },

  initBillScreen() {
    this.billItemsCount = 0;
    document.getElementById('billItemsContainer').innerHTML = '';
    document.getElementById('billPaidAmount').value = "0";
    document.getElementById('billPayMode').value = "Cash";
    this.addBillItemUI();
    this.updateBillTotal();
  },

  addBillItemUI() {
    this.billItemsCount++;
    const id = this.billItemsCount;
    const div = document.createElement('div');
    div.className = "card mb-4";
    div.innerHTML = `
      <div style="margin-bottom: 10px;">
        <label class="text-xs text-muted mb-1 block">Item Description</label>
        <input type="text" id="billDesc_${id}" class="input-field" placeholder="Enter item name..." required>
      </div>
      <div style="display:flex; gap: 10px; align-items: flex-start;">
        <div style="flex: 1;">
          <label class="text-xs text-muted mb-1 block">Qty</label>
          <input type="number" id="billQty_${id}" class="input-field" value="1" min="1" oninput="app.autoCalculateItem(${id})">
        </div>
        <div style="flex: 1;">
          <label class="text-xs text-muted mb-1 block">Rate (₹)</label>
          <input type="number" id="billRate_${id}" class="input-field" placeholder="0" oninput="app.autoCalculateItem(${id})">
        </div>
        <div style="flex: 1;">
          <label class="text-xs text-muted mb-1 block">Amount (₹)</label>
          <input type="number" id="billAmt_${id}" class="input-field border-l-warning" placeholder="0" oninput="app.updateBillTotal()">
        </div>
      </div>
    `;
    document.getElementById('billItemsContainer').appendChild(div);
  },

  autoCalculateItem(id) {
    const qty = Number(document.getElementById(`billQty_${id}`).value || 0);
    const rate = Number(document.getElementById(`billRate_${id}`).value || 0);
    document.getElementById(`billAmt_${id}`).value = qty * rate;
    this.updateBillTotal();
  },

  updateBillTotal() {
    let total = 0;
    for (let i = 1; i <= this.billItemsCount; i++) {
      const amtEl = document.getElementById(`billAmt_${i}`);
      if (amtEl) {
        total += Number(amtEl.value || 0);
      }
    }
    document.getElementById('billTotalDisplay').textContent = '₹' + total;
  },

  saveBill() {
    let totalAmount = 0;
    const items = [];
    for (let i = 1; i <= this.billItemsCount; i++) {
      const desc = document.getElementById(`billDesc_${i}`)?.value || 'Item';
      const qty = Number(document.getElementById(`billQty_${i}`)?.value || 0);
      const rate = Number(document.getElementById(`billRate_${i}`)?.value || 0);
      const amount = Number(document.getElementById(`billAmt_${i}`)?.value || 0);
      
      if (amount > 0) {
        items.push({desc, qty, rate, amount});
        totalAmount += amount;
      }
    }

    if (items.length === 0) {
       alert("Add at least one item with a valid amount.");
       return;
    }

    // Capture pre-bill balance
    const bInfoPre = db.getCustomerBalance(this.activeCustomerId);
    const prevBalance = bInfoPre.rawBalance;

    // Save Bill
    const b = {
      customerId: this.activeCustomerId,
      items: items,
      totalAmount: totalAmount
    };
    db.addBill(b);

    // Save Paid Amount if provided
    const paidAmount = Number(document.getElementById('billPaidAmount').value || 0);
    const payMode = document.getElementById('billPayMode').value;
    if (paidAmount > 0) {
      db.addPayment({
        customerId: this.activeCustomerId,
        amount: paidAmount,
        mode: payMode,
        notes: `Paid with Bill #${b.id}`
      });
    }
    
    // Generate PDF
    this.generatePDF(b, prevBalance, paidAmount);
    this.showToast('Bill saved');
    this.goBack();
  },

  generatePDF(bill, prevBalance, paidAmount) {
    if (!window.jspdf) return;
    const c = db.get('customers').find(x => x.id === bill.customerId);
    const doc = new window.jspdf.jsPDF();
    
    // Watermark
    doc.setTextColor(240, 240, 240); // Very light gray
    doc.setFontSize(120);
    doc.setFont("helvetica", "bold");
    doc.text("demo", 105, 170, { angle: 45, align: "center" });
    
    // Reset colors for normal text
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    
    // Header
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Sri Kaveri Furniture and Home Appliances", 105, 20, null, null, "center");
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Address: Karimangalam Main Road, Agaram, Krishnagiri Dt - 635 204", 105, 26, null, null, "center");
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("INVOICE", 105, 36, null, null, "center");
    
    // Dates & Customer Info
    const d = new Date(bill.date);
    const dateStr = d.toLocaleDateString();
    const timeStr = d.toLocaleTimeString();

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Bill No: ${bill.id}`, 14, 50);
    doc.text(`Date: ${dateStr} ${timeStr}`, 14, 55);
    doc.text(`Customer: ${c ? c.name : 'Walk-in'}`, 14, 65);
    if(c && c.phone) doc.text(`Phone: ${c.phone}`, 14, 70);

    // Table
    const tableData = bill.items.map((i, idx) => [idx+1, i.desc, i.qty, i.rate, i.amount]);
    doc.autoTable({
      startY: 80,
      head: [['#', 'Description', 'Qty', 'Rate', 'Amount']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 9 }
    });

    const finalY = doc.lastAutoTable.finalY || 75;
    
    // Balances Calculation
    const currentBillTotal = Number(bill.totalAmount);
    const netBalance = prevBalance + currentBillTotal - paidAmount;
    
    doc.setFontSize(10);
    doc.text(`Previous Balance: Rs. ${prevBalance}`, 140, finalY + 10);
    doc.text(`Current Bill Total: Rs. ${currentBillTotal}`, 140, finalY + 16);
    doc.text(`Amount Paid: Rs. ${paidAmount}`, 140, finalY + 22);
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    if (netBalance <= 0) {
        doc.text("Net Balance Due: Nill", 140, finalY + 32);
    } else {
        doc.text(`Net Balance Due: Rs. ${netBalance}`, 140, finalY + 32);
    }
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Thanks for your purchase and come again!", 105, finalY + 50, null, null, "center");

    doc.save(`demo_Bill_${bill.id}.pdf`);
  },

  generateCustomerLedgerData(c, pays, bills) {
    const history = [];
    let runningBalance = Number(c.openingBalance || 0);
    
    let addedDate = "Unknown";
    if (c.id) {
       const timestamp = parseInt(c.id);
       if (!isNaN(timestamp) && timestamp > 1000000000000) {
           addedDate = new Date(timestamp).toLocaleDateString();
       }
    }

    if (runningBalance > 0) {
      history.push({
        "Customer Full Name": c.name,
        "Contact Number": c.phone,
        "Date of Registration": addedDate,
        "Transaction Date": addedDate !== "Unknown" ? addedDate : "-",
        "Transaction Time": "-",
        "Item Description / Particulars": "Opening Balance",
        "Quantity": "-",
        "Item Amount (₹)": runningBalance,
        "Amount Paid (₹)": 0,
        "Pending Balance (₹)": runningBalance,
        "Payment Mode / Ref": "-"
      });
    }

    const allEvents = [
      ...pays.map(p => ({ ...p, type: 'Payment', dateObj: new Date(p.date) })),
      ...bills.map(b => ({ ...b, type: 'Bill', dateObj: new Date(b.date) }))
    ];
    allEvents.sort((a,b) => a.dateObj - b.dateObj);

    for (const ev of allEvents) {
      if (ev.type === 'Payment') {
        runningBalance -= Number(ev.amount);
        history.push({
          "Customer Full Name": c.name,
          "Contact Number": c.phone,
          "Date of Registration": addedDate,
          "Transaction Date": ev.dateObj.toLocaleDateString(),
          "Transaction Time": ev.dateObj.toLocaleTimeString(),
          "Item Description / Particulars": ev.notes || "Payment Received",
          "Quantity": "-",
          "Item Amount (₹)": "-",
          "Amount Paid (₹)": Number(ev.amount),
          "Pending Balance (₹)": runningBalance > 0 ? runningBalance : "Nill",
          "Payment Mode / Ref": ev.mode
        });
      } else if (ev.type === 'Bill') {
        for (let i = 0; i < ev.items.length; i++) {
          const item = ev.items[i];
          runningBalance += Number(item.amount);
          history.push({
            "Customer Full Name": c.name,
            "Contact Number": c.phone,
            "Date of Registration": addedDate,
            "Transaction Date": ev.dateObj.toLocaleDateString(),
            "Transaction Time": ev.dateObj.toLocaleTimeString(),
            "Item Description / Particulars": item.desc,
            "Quantity": item.qty,
            "Item Amount (₹)": Number(item.amount),
            "Amount Paid (₹)": 0,
            "Pending Balance (₹)": runningBalance > 0 ? runningBalance : "Nill",
            "Payment Mode / Ref": `Bill #${ev.id}`
          });
        }
      }
    }
    return history;
  },

  exportCustomerLedger() {
    if (!window.XLSX) return;
    if (!this.activeCustomerId) return;
    
    const c = db.get('customers').find(x => x.id === this.activeCustomerId);
    if (!c) return;

    const pays = db.get('payments').filter(x => x.customerId === c.id);
    const bills = db.get('bills').filter(x => x.customerId === c.id);
    const history = this.generateCustomerLedgerData(c, pays, bills);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(history);
    XLSX.utils.book_append_sheet(wb, ws, "Ledger");
    XLSX.writeFile(wb, `demo_${c.name.replace(/\s+/g, '_')}_Ledger.xlsx`);
    this.showToast("Ledger Exported");
  },

  exportToExcel() {
    if (!window.XLSX) return;
    
    const custs = db.get('customers');
    const pays = db.get('payments');
    const bills = db.get('bills');
    
    let globalExportData = [];
    
    for (const c of custs) {
       const cPays = pays.filter(p => p.customerId === c.id);
       const cBills = bills.filter(b => b.customerId === c.id);
       const cHistory = this.generateCustomerLedgerData(c, cPays, cBills);
       globalExportData = globalExportData.concat(cHistory);
    }

    if (globalExportData.length === 0) {
        alert("No transaction data available to export.");
        return;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(globalExportData);
    XLSX.utils.book_append_sheet(wb, ws, "demo_All_Transactions");
    XLSX.writeFile(wb, "demo_Global_Export_Detailed.xlsx");
    this.showToast("Detailed Export complete");
  },

  async factoryReset() {
    if (confirm("Are you sure? This will delete all your local data permanently.")) {
      const isAuth = await this.promptForPassword();
      if (!isAuth) {
         alert("Incorrect password!");
         return;
      }
      localStorage.clear();
      location.reload();
    }
  }
};

window.app = app; // Expose to global scope for inline handlers

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
