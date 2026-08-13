import React, { useState, useEffect } from 'react';
import { BACKEND_URL, socket } from '../App';
import InternalChatBox from './InternalChatBox';
import LiveActivityFeed from './LiveActivityFeed';
import useFacilitySocket from '../hooks/useFacilitySocket';
import useLiveRefresh from '../hooks/useLiveRefresh';
import HelpPanel from './HelpPanel';
import useFacilityFromUrl from '../hooks/useFacilityFromUrl';
import DashboardShell from './dashboard/DashboardShell';

/** Colour per billing category, so the counter can pick a charge by shape as
 *  well as by reading it — the same categories the Invoice schema allows. */
const CATEGORY_CHIP = {
  Medicine: 'bg-teal-500/10 text-teal-600 hover:bg-teal-500/20',
  'Lab Test': 'bg-sky-500/10 text-sky-600 hover:bg-sky-500/20',
  Consultation: 'bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20',
  'Nursing / Bandage': 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20',
  'Room / Bed': 'bg-purple-500/10 text-purple-600 hover:bg-purple-500/20',
  'Equipment / Consumable': 'bg-rose-500/10 text-rose-600 hover:bg-rose-500/20',
  Other: 'bg-zinc-500/10 text-zinc-500 hover:bg-zinc-500/20'
};

const BILLING_CATEGORIES = Object.keys(CATEGORY_CHIP);

export function StaffDashboard({ staffToken, staffUser, onLogout }) {
  const [queues, setQueues] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  // Opens on Arrivals, not on the stats page. A receptionist signs in to find
  // out who is standing in front of them and who is due — the Overview is
  // something you look at once a day, and making it the landing screen cost
  // every user a click before they could start working.
  const [activeSidebarTab, setActiveSidebarTab] = useState('reception');

  // Modals state
  const [showAddPatientModal, setShowAddPatientModal] = useState(false);
  const [showEditPatientModal, setShowEditPatientModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);

  // Add/Edit Patient form fields
  const [patName, setPatName] = useState('');
  const [patPhone, setPatPhone] = useState('');
  const [patAge, setPatAge] = useState('');
  const [patGender, setPatGender] = useState('Male');
  const [patError, setPatError] = useState('');
  const [patSuccess, setPatSuccess] = useState('');

  // Search filter for patients
  const [patientSearch, setPatientSearch] = useState('');

  // Walk-in booking form fields
  const [walkName, setWalkName] = useState('');
  const [walkAge, setWalkAge] = useState('');
  const [walkGender, setWalkGender] = useState('Male');
  const [walkPhone, setWalkPhone] = useState('');
  const [walkDoctorId, setWalkDoctorId] = useState('');
  const [walkSymptoms, setWalkSymptoms] = useState('');
  const [walkIsEmergency, setWalkIsEmergency] = useState(false);
  const [walkPriority, setWalkPriority] = useState('None');
  const [walkError, setWalkError] = useState('');
  const [walkSuccess, setWalkSuccess] = useState('');

  // SPECIAL RECEPTION DESK — today's arrivals at this facility, with the ones who
  // booked remotely (WhatsApp / the web assistant) called out. Those patients
  // never pass the counter, so this is the only place reception can see them,
  // grant a special-needs priority, and start their bill.
  const [arrivals, setArrivals] = useState([]);
  const [arrivalSummary, setArrivalSummary] = useState(null);
  const [arrivalFilter, setArrivalFilter] = useState('remote');
  const [arrivalBusyId, setArrivalBusyId] = useState('');
  const [arrivalError, setArrivalError] = useState('');
  const [arrivalNotice, setArrivalNotice] = useState('');

  // Live facility overview + cross-department alerts
  const [overview, setOverview] = useState(null);
  const [stockAlert, setStockAlert] = useState('');
  // Errors from queue actions (status change / emergency override). These
  // handlers previously called a `setError` that was never declared, so the
  // success path threw a ReferenceError before it could refresh the board and
  // the failure path threw again inside its own catch — the buttons looked
  // dead. ESLint's no-undef caught it.
  const [queueError, setQueueError] = useState('');

  useFacilitySocket('staff', staffUser?.hospital || 'general-hospital');

  // Reminders state
  const [reminders, setReminders] = useState([]);
  const [remindersLoading, setRemindersLoading] = useState(false);
  const [triggerLog, setTriggerLog] = useState(null);

  // Billing & Discharge state
  const [invoices, setInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [billingSearch, setBillingSearch] = useState('');
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [addItemCategory, setAddItemCategory] = useState('Medicine');
  const [addItemName, setAddItemName] = useState('');
  const [addItemQty, setAddItemQty] = useState('1');
  const [addItemPrice, setAddItemPrice] = useState('');
  const [addItemSuccess, setAddItemSuccess] = useState('');
  const [addItemError, setAddItemError] = useState('');

  // This facility's own rate card — every price shown at the counter comes from
  // here, never from a constant in this file. A second hospital on the platform
  // gets its own document and therefore its own prices, tax and letterhead.
  const [billingConfig, setBillingConfig] = useState(null);
  const [showRateCardModal, setShowRateCardModal] = useState(false);
  const [rateForm, setRateForm] = useState(null);
  const [rateError, setRateError] = useState('');
  const [rateSuccess, setRateSuccess] = useState('');
  const [newSvcCategory, setNewSvcCategory] = useState('Nursing / Bandage');
  const [newSvcName, setNewSvcName] = useState('');
  const [newSvcPrice, setNewSvcPrice] = useState('');

  // Open a bill for any patient — registered or a walk-in with no token at all.
  const [showNewBillModal, setShowNewBillModal] = useState(false);
  const [newBillMode, setNewBillMode] = useState('existing');
  const [newBillPatientId, setNewBillPatientId] = useState('');
  const [newBillSearch, setNewBillSearch] = useState('');
  const [newBillName, setNewBillName] = useState('');
  const [newBillPhone, setNewBillPhone] = useState('');
  const [newBillAge, setNewBillAge] = useState('');
  const [newBillGender, setNewBillGender] = useState('Male');
  const [newBillConsult, setNewBillConsult] = useState(true);
  const [newBillError, setNewBillError] = useState('');

  const [showDischargeModal, setShowDischargeModal] = useState(false);
  const [dischargeAmountPaid, setDischargeAmountPaid] = useState('');
  const [dischargeMethod, setDischargeMethod] = useState('Cash');
  const [dischargeDiscount, setDischargeDiscount] = useState('0');
  const [dischargeNotes, setDischargeNotes] = useState('');
  const [dischargeSuccess, setDischargeSuccess] = useState('');
  const [dischargeError, setDischargeError] = useState('');
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  const loadInvoices = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/billing/invoices`, {
        headers: { Authorization: `Bearer ${staffToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setInvoices(data);
          if (selectedInvoice) {
            const updatedSel = data.find((inv) => inv._id === selectedInvoice._id);
            if (updatedSel) setSelectedInvoice(updatedSel);
          }
        }
      }
    } catch (err) {
      console.error('Error loading billing invoices:', err);
    }
  };

  const loadBillingConfig = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/billing/config`, {
        headers: { Authorization: `Bearer ${staffToken}` }
      });
      if (res.ok) setBillingConfig(await res.json());
    } catch (err) {
      console.error('Error loading facility rate card:', err);
    }
  };

  const currency = billingConfig?.currencySymbol || '₹';

  const loadArrivals = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/staff/reception/arrivals`, {
        headers: { Authorization: `Bearer ${staffToken}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      setArrivals(Array.isArray(data.arrivals) ? data.arrivals : []);
      setArrivalSummary(data.summary || null);
    } catch (err) {
      console.error('Error loading reception arrivals:', err);
    }
  };

  /**
   * Grant (or clear) the vulnerable-group priority for a patient who booked from
   * home. Reception could only do this while registering a walk-in, so a senior
   * citizen or a disabled patient arriving on a WhatsApp token had no way to be
   * moved up short of re-registering them at the counter.
   */
  const handleSetArrivalPriority = async (tokenId, priorityCategory) => {
    setArrivalError('');
    setArrivalNotice('');
    setArrivalBusyId(tokenId);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/staff/tokens/${tokenId}/priority`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffToken}` },
        body: JSON.stringify({ priorityCategory })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not update the priority');
      setArrivalNotice(data.message);
      setTimeout(() => setArrivalNotice(''), 4000);
      loadArrivals();
      loadData();
    } catch (err) {
      setArrivalError(err.message);
    } finally {
      setArrivalBusyId('');
    }
  };

  /**
   * Start (or reopen) the bill for an arrival and drop reception straight into the
   * billing counter with it selected — the endpoint creates the invoice at this
   * facility's own rates on first call.
   */
  const handleBillArrival = async (tokenId) => {
    setArrivalError('');
    setArrivalBusyId(tokenId);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/billing/token/${tokenId}`, {
        headers: { Authorization: `Bearer ${staffToken}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not open the bill');
      setSelectedInvoice(data);
      await loadInvoices();
      setActiveSidebarTab('billing');
    } catch (err) {
      setArrivalError(err.message);
    } finally {
      setArrivalBusyId('');
    }
  };

  const handleCreateInvoice = async (e) => {
    e.preventDefault();
    setNewBillError('');

    const body = { addConsultationFee: newBillConsult };
    if (newBillMode === 'existing') {
      if (!newBillPatientId) {
        setNewBillError('Select a patient from the list.');
        return;
      }
      body.patientId = newBillPatientId;
    } else {
      body.newPatient = {
        name: newBillName,
        phone: newBillPhone,
        age: newBillAge,
        gender: newBillGender
      };
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/billing/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffToken}` },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not open the bill');

      setSelectedInvoice(data.invoice);
      setShowNewBillModal(false);
      setNewBillName('');
      setNewBillPhone('');
      setNewBillAge('');
      setNewBillPatientId('');
      setNewBillSearch('');
      loadInvoices();
      loadData();
    } catch (err) {
      setNewBillError(err.message);
    }
  };

  const handleSaveRateCard = async (e) => {
    e.preventDefault();
    setRateError('');
    setRateSuccess('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/billing/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffToken}` },
        body: JSON.stringify(rateForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not save the rate card');
      setBillingConfig(data.config);
      setRateSuccess('Rate card saved for this hospital.');
      setTimeout(() => setRateSuccess(''), 2500);
    } catch (err) {
      setRateError(err.message);
    }
  };

  const handleAddService = async (e) => {
    e.preventDefault();
    setRateError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/billing/config/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffToken}` },
        body: JSON.stringify({
          category: newSvcCategory,
          name: newSvcName,
          price: parseFloat(newSvcPrice) || 0
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not add the service');
      setBillingConfig(data.config);
      setNewSvcName('');
      setNewSvcPrice('');
    } catch (err) {
      setRateError(err.message);
    }
  };

  const handleDeleteService = async (serviceId) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/billing/config/services/${serviceId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${staffToken}` }
      });
      const data = await res.json();
      if (res.ok) setBillingConfig(data.config);
    } catch (err) {
      console.error('Error removing service:', err);
    }
  };

  const handleAddInvoiceItem = async (e) => {
    e.preventDefault();
    if (!selectedInvoice?._id) return;
    setAddItemError('');
    setAddItemSuccess('');

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/billing/invoices/${selectedInvoice._id}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${staffToken}`
        },
        body: JSON.stringify({
          category: addItemCategory,
          itemName: addItemName,
          quantity: parseInt(addItemQty) || 1,
          unitPrice: parseFloat(addItemPrice) || 0
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to add item');

      setSelectedInvoice(data.invoice);
      setAddItemName('');
      setAddItemPrice('');
      setAddItemQty('1');
      setAddItemSuccess('Item added to bill!');
      loadInvoices();
      setTimeout(() => {
        setShowAddItemModal(false);
        setAddItemSuccess('');
      }, 800);
    } catch (err) {
      setAddItemError(err.message);
    }
  };

  const handleRemoveInvoiceItem = async (itemId) => {
    if (!selectedInvoice?._id) return;
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/v1/billing/invoices/${selectedInvoice._id}/items/${itemId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${staffToken}` }
        }
      );
      const data = await res.json();
      if (res.ok) {
        setSelectedInvoice(data.invoice);
        loadInvoices();
      }
    } catch (err) {
      console.error('Error deleting item:', err);
    }
  };

  const handleSyncPrescriptions = async () => {
    if (!selectedInvoice?._id) return;
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/v1/billing/invoices/${selectedInvoice._id}/sync-prescriptions`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${staffToken}` }
        }
      );
      const data = await res.json();
      if (res.ok) {
        setSelectedInvoice(data.invoice);
        alert(data.message);
        loadInvoices();
      } else {
        alert(data.message);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDischargePatient = async (e) => {
    e.preventDefault();
    if (!selectedInvoice?._id) return;
    setDischargeError('');
    setDischargeSuccess('');

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/billing/invoices/${selectedInvoice._id}/discharge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${staffToken}`
        },
        body: JSON.stringify({
          amountPaid: parseFloat(dischargeAmountPaid) || selectedInvoice.totalAmount,
          paymentMethod: dischargeMethod,
          discount: parseFloat(dischargeDiscount) || 0,
          notes: dischargeNotes
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Discharge failed');

      setSelectedInvoice(data.invoice);
      setDischargeSuccess(`Patient discharged successfully! Receipt generated.`);
      loadInvoices();
      loadData();
      setTimeout(() => {
        setShowDischargeModal(false);
        setShowReceiptModal(true);
        setDischargeSuccess('');
      }, 1000);
    } catch (err) {
      setDischargeError(err.message);
    }
  };

  const loadData = async () => {
    try {
      const resQ = await fetch(`${BACKEND_URL}/api/v1/staff/queues`, {
        headers: { Authorization: `Bearer ${staffToken}` }
      });
      if (resQ.status === 401 || resQ.status === 403) {
        onLogout();
        return;
      }
      const dataQ = await resQ.json();
      if (Array.isArray(dataQ)) {
        setQueues(dataQ);
        const fetchedDocs = dataQ.map((q) => q.doctor).filter(Boolean);
        setDoctors(fetchedDocs);
        // Leave walkDoctorId empty by default → the walk-in form uses SMART
        // AUTO-ASSIGN (symptom-based triage + least-busy doctor) unless reception
        // deliberately overrides it. This is what cuts the counter's workload.
      } else {
        console.error('Invalid queues data format:', dataQ);
      }

      // Fetch patients
      const resP = await fetch(`${BACKEND_URL}/api/v1/staff/patients`, {
        headers: { Authorization: `Bearer ${staffToken}` }
      });
      if (resP.status === 401 || resP.status === 403) {
        onLogout();
        return;
      }
      const dataP = await resP.json();
      if (Array.isArray(dataP)) {
        setPatients(dataP);
      } else {
        console.error('Invalid patients data format:', dataP);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadReminders = async () => {
    setRemindersLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/staff/reminders`, {
        headers: { Authorization: `Bearer ${staffToken}` }
      });
      const data = await res.json();
      setReminders(data);
    } catch (err) {
      console.error(err);
    } finally {
      setRemindersLoading(false);
    }
  };

  // Whole-facility live picture: where every patient is, which cabin is drowning,
  // what the lab and pharmacy are sitting on. Reception could previously only see
  // doctor queues and had to phone the other counters for anything else.
  const loadOverview = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/ops/overview`, {
        headers: { Authorization: `Bearer ${staffToken}` }
      });
      if (res.ok) setOverview(await res.json());
    } catch (err) {
      console.error('Error loading facility overview:', err);
    }
  };

  useEffect(() => {
    loadData();
    loadOverview();
    loadInvoices();
    loadBillingConfig();
    loadArrivals();

    socket.emit('join-room', 'queue:global');

    const handleQueueUpdated = () => {
      loadData();
      loadOverview();
      if (activeSidebarTab === 'reminders') {
        loadReminders();
      }
      if (activeSidebarTab === 'billing') {
        loadInvoices();
      }
    };

    const handleStockAlert = (payload) => {
      if (payload && payload.name) {
        setStockAlert(
          `${payload.name} is ${payload.level === 'out' ? 'OUT OF STOCK' : 'running low'} at the pharmacy${payload.tokenNumber ? ` (needed for ${payload.tokenNumber})` : ''}.`
        );
      }
      loadOverview();
    };

    // Only the alert banner needs the raw event; the reloads are coalesced by
    // useLiveRefresh below so one clinical action causes one refresh, not four.
    socket.on('stock-alert', handleStockAlert);
    return () => socket.off('stock-alert', handleStockAlert);
  }, [staffToken, activeSidebarTab]);

  // One reload for a burst of events. Reception's refresh is the most expensive
  // in the app (queues + patient directory + facility overview), so collapsing
  // the fan-out of a single doctor action from four refetches to one is what
  // stops the board stuttering on a busy morning.
  useLiveRefresh(['queue-updated', 'queue-reset'], () => {
    loadData();
    loadOverview();
    if (activeSidebarTab === 'reminders') loadReminders();
    if (activeSidebarTab === 'billing') loadInvoices();
    if (activeSidebarTab === 'reception') loadArrivals();
  });
  // `remote-arrival` is emitted into this facility's room only, the instant a
  // patient finishes booking on WhatsApp — so the desk shows them while they are
  // still reading the confirmation, without anyone refreshing anything.
  useLiveRefresh(['remote-arrival', 'billing-updated', 'patient-discharged'], loadArrivals);
  useLiveRefresh(['journey-updated', 'lab-updated', 'doctor-status-update', 'stock-alert'], loadOverview);
  useLiveRefresh(['billing-updated', 'patient-discharged'], loadInvoices);
  // Another counter changing a price must not leave this screen quoting the old
  // one — the rate card is facility-wide state, so it refreshes like the queue.
  useLiveRefresh(['billing-config-updated'], loadBillingConfig);

  useEffect(() => {
    if (!stockAlert) return undefined;
    const t = setTimeout(() => setStockAlert(''), 15000);
    return () => clearTimeout(t);
  }, [stockAlert]);

  const handleRegisterWalkIn = async (e) => {
    e.preventDefault();
    setWalkError('');
    setWalkSuccess('');

    try {
      const payload = {
        name: walkName,
        age: parseInt(walkAge),
        gender: walkGender,
        phone: walkPhone,
        symptoms: walkSymptoms,
        tokenType: walkIsEmergency ? 'Emergency' : 'Regular'
      };
      // Only pin a doctor when reception explicitly overrode auto-assign.
      if (walkDoctorId) payload.doctorId = walkDoctorId;
      // Only send a priority when reception picked one; else backend auto-detects.
      if (walkPriority && walkPriority !== 'None') payload.priorityCategory = walkPriority;

      const res = await fetch(`${BACKEND_URL}/api/v1/staff/tokens/walk-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${staffToken}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Booking failed');
      }

      const docName = data.token?.doctor?.name || 'the assigned doctor';
      if (data.autoTriaged) {
        const emTag = data.token?.tokenType === 'Emergency' ? ' 🚨 auto-flagged EMERGENCY' : '';
        setWalkSuccess(
          `Token ${data.token.tokenNumber} → auto-routed to ${docName} (${data.triagedDepartment})${emTag}.`
        );
      } else {
        setWalkSuccess(`Walk-in generated: Token ${data.token.tokenNumber} for ${docName}.`);
      }
      setWalkName('');
      setWalkAge('');
      setWalkPhone('');
      setWalkSymptoms('');
      setWalkIsEmergency(false);
      setWalkPriority('None');
      setWalkDoctorId('');
      loadData();
    } catch (err) {
      setWalkError(err.message);
    }
  };

  const handleStatusChange = async (tokenId, status) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/staff/tokens/${tokenId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${staffToken}`
        },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to update token status');
      }
      setQueueError('');
      loadData();
    } catch (err) {
      setQueueError(err.message);
    }
  };

  const handleEmergencyOverride = async (tokenId) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/staff/tokens/${tokenId}/override`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${staffToken}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to escalate token to Emergency');
      }
      setQueueError('');
      loadData();
    } catch (err) {
      setQueueError(err.message);
    }
  };

  const handleAddPatient = async (e) => {
    e.preventDefault();
    setPatError('');
    setPatSuccess('');

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/staff/patients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${staffToken}`
        },
        body: JSON.stringify({
          name: patName,
          phone: patPhone,
          age: parseInt(patAge),
          gender: patGender
        })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Registration failed');
      }

      setPatSuccess('Patient added successfully!');
      setPatName('');
      setPatPhone('');
      setPatAge('');
      setPatGender('Male');
      loadData();
      setTimeout(() => {
        setShowAddPatientModal(false);
        setPatSuccess('');
      }, 1000);
    } catch (err) {
      setPatError(err.message);
    }
  };

  const handleEditPatient = async (e) => {
    e.preventDefault();
    setPatError('');
    setPatSuccess('');

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/staff/patients/${selectedPatient._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${staffToken}`
        },
        body: JSON.stringify({
          name: patName,
          phone: patPhone,
          age: parseInt(patAge),
          gender: patGender
        })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Update failed');
      }

      setPatSuccess('Patient details updated successfully!');
      loadData();
      setTimeout(() => {
        setShowEditPatientModal(false);
        setPatSuccess('');
        setSelectedPatient(null);
      }, 1000);
    } catch (err) {
      setPatError(err.message);
    }
  };

  const handleTriggerReminders = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/staff/reminders/trigger`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` }
      });
      const data = await res.json();
      if (res.ok) {
        setTriggerLog(data.sentReminders);
        loadReminders();
        setTimeout(() => setTriggerLog(null), 8000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Compute live Healight KPI stats
  const totalDocCount = Array.isArray(doctors) ? doctors.length : 0;
  const activeAppointmentsCount = Array.isArray(queues)
    ? queues.reduce(
        (acc, q) => acc + (q.currentToken ? 1 : 0) + (q.activeQueue ? q.activeQueue.length : 0),
        0
      )
    : 0;
  const availableRoomsCount = Array.isArray(queues)
    ? queues.filter((q) => q.doctor?.availabilityStatus === 'Available').length
    : 0;
  const totalPatientsCount = Array.isArray(patients) ? patients.length : 0;

  // Extract next 4 appointments in line across all doctors
  const nextAppointments = [];
  if (Array.isArray(queues)) {
    queues.forEach((q) => {
      if (q.currentToken) {
        nextAppointments.push({
          name: q.currentToken.patient?.name || 'Walk-in Patient',
          symptoms: q.currentToken.symptoms,
          time: q.currentToken.calledAt
            ? new Date(q.currentToken.calledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Active',
          avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${q.currentToken.patient?.name || 'patient'}`
        });
      }
      if (Array.isArray(q.activeQueue)) {
        q.activeQueue
          .filter(Boolean)
          .slice(0, 2)
          .forEach((tok, idx) => {
            nextAppointments.push({
              name: tok.patient?.name || 'Waiting Patient',
              symptoms: tok.symptoms,
              time: `Wait: ${tok.estimatedWaitTime}m`,
              avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${tok.patient?.name || 'patient'}`
            });
          });
      }
    });
  }
  const recentAppointmentsList = nextAppointments.slice(0, 4);

  // Filter patients list
  const filteredPatients = Array.isArray(patients)
    ? patients.filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(patientSearch.toLowerCase())) ||
          (p.phone && p.phone.includes(patientSearch))
      )
    : [];

  // Which arrivals the desk is looking at. It opens on "remote" — the patients
  // who booked from home and are the whole reason this section exists.
  const isSpecialArrival = (a) => a.tokenType === 'Emergency' || a.priorityCategory !== 'None';
  const visibleArrivals = arrivals.filter((a) => {
    if (arrivalFilter === 'remote') return a.bookingSource !== 'Reception';
    if (arrivalFilter === 'special') return isSpecialArrival(a);
    if (arrivalFilter === 'unbilled') return !a.bill || a.bill.status !== 'Discharged';
    return true;
  });

  const SOURCE_BADGE = {
    WhatsApp: { icon: 'chat', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    'QR Scan': { icon: 'qr_code_2', className: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20' },
    'Web Assistant': { icon: 'language', className: 'bg-sky-500/10 text-sky-600 border-sky-500/20' },
    Reception: { icon: 'contact_page', className: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' }
  };

  const PRIORITY_OPTIONS = [
    { value: 'Senior', label: 'Senior', icon: '👵' },
    { value: 'Pregnant', label: 'Expecting', icon: '🤰' },
    { value: 'Disabled', label: 'Special needs', icon: '♿' },
    { value: 'None', label: 'Regular', icon: '•' }
  ];

  // Filter invoices list
  const filteredInvoices = Array.isArray(invoices)
    ? invoices.filter((inv) => {
        const q = billingSearch.toLowerCase();
        const patName = inv.patient?.name ? inv.patient.name.toLowerCase() : '';
        const patPhone = inv.patient?.phone || '';
        const invNum = inv.invoiceNumber ? inv.invoiceNumber.toLowerCase() : '';
        const tokNum = inv.token?.tokenNumber ? inv.token.tokenNumber.toLowerCase() : '';
        return patName.includes(q) || patPhone.includes(q) || invNum.includes(q) || tokNum.includes(q);
      })
    : [];

  return (
    <DashboardShell
      role="staff"
      user={staffUser}
      activeKey={activeSidebarTab}
      onNavigate={(key) => {
        setActiveSidebarTab(key);
        if (key === 'reminders') loadReminders();
        if (key === 'billing') loadInvoices();
        if (key === 'reception') loadArrivals();
      }}
      onLogout={onLogout}
      subtitle={staffUser?.counterNumber || 'Reception'}
    >
      <div className="p-4 md:p-8 flex-1 flex flex-col">
        {/* A failed queue action must be visible — reception needs to know the
              token did NOT change, not be left guessing why nothing happened. */}
        {queueError && (
          <div className="mb-5 bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-400 rounded-xl px-4 py-3 text-[13px] font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span className="flex-1">{queueError}</span>
            <button
              onClick={() => setQueueError('')}
              className="text-[12px] font-black opacity-60 hover:opacity-100"
            >
              DISMISS
            </button>
          </div>
        )}

        {/* Cross-department alert: reception hears about a stock-out the
              moment the pharmacy does, because the patient will ask them. */}
        {stockAlert && (
          <div className="mb-5 bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-400 rounded-xl px-4 py-3 text-[13px] font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">production_quantity_limits</span>
            <span className="flex-1">{stockAlert}</span>
            <button
              onClick={() => setStockAlert('')}
              className="text-[12px] font-black opacity-60 hover:opacity-100"
            >
              DISMISS
            </button>
          </div>
        )}

        {/* TAB 1: DASHBOARD OVERVIEW */}
        {activeSidebarTab === 'dashboard' && (
          <div className="space-y-8 animate-fade-in">
            <HelpPanel
              id="staff"
              title="How the reception desk works"
              steps={[
                "Register a walk-in without picking a doctor — the system reads the symptoms and assigns the right department's least-busy doctor.",
                'The Live Floor View below shows where every patient in the building is: waiting, in a cabin, at the lab or at the pharmacy.',
                'Cabin Load tells you who is free right now, so you can steer the next patient instead of guessing.',
                'The activity feed on the right is the whole hospital talking — doctors, lab and pharmacy — as it happens.'
              ]}
              tip="Patients do not need to queue at your counter: they get a WhatsApp when their turn is near, and can book themselves on WhatsApp too."
            />

            {/* LIVE FLOOR VIEW — where every patient in the building is right
                  now, and which department is the bottleneck. */}
            {overview && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-6 shadow-[var(--card-shadow)] space-y-5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h4 className="font-extrabold text-[var(--text-color)] text-base">Live Floor View</h4>
                      <p className="text-[13px] text-[var(--text-secondary)] font-medium">
                        Every patient in the building, by stage
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-[13px] font-bold">
                      <span className="text-[var(--text-secondary)]">
                        {overview.doctorsOnDuty} doctor{overview.doctorsOnDuty === 1 ? '' : 's'} on duty
                      </span>
                      {overview.longestWaitMins > 0 && (
                        <span className={overview.longestWaitMins > 45 ? 'text-rose-500' : 'text-amber-500'}>
                          Longest wait {overview.longestWaitMins}m ({overview.longestWaitToken})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { k: 'Waiting', v: overview.byStage.Waiting || 0, tone: 'text-amber-500' },
                      {
                        k: 'In cabin',
                        v: overview.byStage['In Consultation'] || 0,
                        tone: 'text-[var(--primary-color)]'
                      },
                      {
                        k: 'At lab',
                        v: (overview.byStage['Lab Pending'] || 0) + (overview.byStage['Lab Complete'] || 0),
                        tone: 'text-sky-500'
                      },
                      {
                        k: 'At pharmacy',
                        v: overview.byStage['Pharmacy Pending'] || 0,
                        tone: 'text-violet-500'
                      }
                    ].map((s) => (
                      <div
                        key={s.k}
                        className="bg-[var(--bg-color)] border border-[var(--border-color)]/40 rounded-xl p-3"
                      >
                        <p className="text-[12px] uppercase font-bold text-[var(--text-secondary)] tracking-wide">
                          {s.k}
                        </p>
                        <p className={`text-2xl font-black leading-none mt-1 ${s.tone}`}>{s.v}</p>
                      </div>
                    ))}
                  </div>

                  {/* Per-cabin load — who to route the next walk-in to. */}
                  <div className="space-y-2">
                    <p className="text-[12px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">
                      Cabin load
                    </p>
                    {overview.doctorLoad.map((d) => (
                      <div
                        key={d._id}
                        className="flex items-center justify-between gap-3 bg-[var(--bg-color)] border border-[var(--border-color)]/40 rounded-xl px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold text-[var(--text-color)] truncate">
                            {d.name}{' '}
                            <span className="text-[var(--text-secondary)] font-semibold">
                              • {d.department}
                            </span>
                          </p>
                          <p className="text-[12px] text-[var(--text-secondary)] font-semibold">
                            {d.room} • seen {d.seenToday} today
                            {d.dailyTokenLimit > 0 ? ` • cap ${d.dailyTokenLimit}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded-full font-black ${
                              d.availabilityStatus === 'Available'
                                ? 'bg-emerald-500/15 text-emerald-500'
                                : 'bg-amber-500/15 text-amber-500'
                            }`}
                          >
                            {d.availabilityStatus}
                          </span>
                          <div className="text-right">
                            <p
                              className={`text-[15px] font-black leading-none ${d.waiting > 8 ? 'text-rose-500' : 'text-[var(--text-color)]'}`}
                            >
                              {d.waiting}
                            </p>
                            <p className="text-[11px] text-[var(--text-secondary)] font-bold">
                              ~{d.estimatedWait}m
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Other departments' backlog — no more phoning the counters. */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                    {[
                      {
                        k: 'Lab pending',
                        v: overview.departments.lab.pending,
                        warn: overview.departments.lab.urgent > 0,
                        note: overview.departments.lab.urgent
                          ? `${overview.departments.lab.urgent} urgent`
                          : ''
                      },
                      {
                        k: 'Abnormal',
                        v: overview.departments.lab.abnormal,
                        warn: overview.departments.lab.abnormal > 0,
                        note: 'needs doctor'
                      },
                      { k: 'Rx pending', v: overview.departments.pharmacy.pending, warn: false, note: '' },
                      {
                        k: 'Stock issues',
                        v: overview.departments.pharmacy.outOfStock + overview.departments.pharmacy.lowStock,
                        warn: overview.departments.pharmacy.outOfStock > 0,
                        note: `${overview.departments.pharmacy.outOfStock} out`
                      }
                    ].map((s) => (
                      <div
                        key={s.k}
                        className={`rounded-xl p-3 border ${s.warn ? 'bg-rose-500/5 border-rose-500/30' : 'bg-[var(--bg-color)] border-[var(--border-color)]/40'}`}
                      >
                        <p className="text-[12px] uppercase font-bold text-[var(--text-secondary)] tracking-wide">
                          {s.k}
                        </p>
                        <p
                          className={`text-xl font-black leading-none mt-1 ${s.warn ? 'text-rose-500' : 'text-[var(--text-color)]'}`}
                        >
                          {s.v}
                        </p>
                        {s.note && (
                          <p className="text-[11px] font-bold text-[var(--text-secondary)] mt-0.5">
                            {s.note}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <LiveActivityFeed token={staffToken} title="Live Hospital Activity" limit={30} />
              </div>
            )}

            {/* Widescreen KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              {[
                {
                  label: "Today's Patients",
                  count: totalPatientsCount,
                  icon: 'groups',
                  sub: 'Total registered in directory',
                  color: 'text-[var(--primary-color)]',
                  bg: 'bg-[var(--primary-color)]/10'
                },
                {
                  label: 'Waiting',
                  count: activeAppointmentsCount,
                  icon: 'hourglass_empty',
                  sub: 'Live active queue volume',
                  color: 'text-[var(--secondary-color)]',
                  bg: 'bg-[var(--secondary-color)]/10'
                },
                {
                  label: 'Emergency',
                  count: queues.reduce(
                    (acc, q) =>
                      acc +
                      (q.currentToken && q.currentToken.tokenType === 'Emergency' ? 1 : 0) +
                      (q.activeQueue
                        ? q.activeQueue.filter((t) => t && t.tokenType === 'Emergency').length
                        : 0),
                    0
                  ),
                  icon: 'emergency',
                  sub: 'Critical SOS tokens active',
                  color: 'text-[var(--error-color)]',
                  bg: 'bg-[var(--error-bg)]/80'
                },
                {
                  label: 'Available Rooms',
                  count: availableRoomsCount,
                  icon: 'payments',
                  sub: 'Doctor rooms active now',
                  color: 'text-[var(--tertiary-color)]',
                  bg: 'bg-[var(--tertiary-container)]/10'
                }
              ].map((kpi, idx) => (
                <div
                  key={idx}
                  className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-xl p-5 shadow-[var(--card-shadow)] flex items-center justify-between"
                >
                  <div>
                    <p className="text-[12px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
                      {kpi.label}
                    </p>
                    <p className="text-3xl font-black text-[var(--primary-color)] dark:text-zinc-300 leading-none">
                      {kpi.count}
                    </p>
                  </div>
                  <div
                    className={`w-11 h-11 rounded-full ${kpi.bg} flex items-center justify-center ${kpi.color}`}
                  >
                    <span className="material-symbols-outlined text-[20px]">{kpi.icon}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Middle Section: Chart & Appointments Stack */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Card: Weekly Recovery SVG Line Chart */}
              <div className="lg:col-span-2 bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-6 shadow-[var(--card-shadow)] flex flex-col space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-[var(--border-color)]/30">
                  <div>
                    <h4 className="font-extrabold text-[var(--text-color)] text-base">
                      Checkup Inflow Trends
                    </h4>
                    <p className="text-[13px] text-[var(--text-secondary)] font-medium">
                      Insights of daily checkup registrations and recoveries
                    </p>
                  </div>
                  <div className="flex space-x-3 text-[13px] font-semibold">
                    <div className="flex items-center space-x-1.5">
                      <span className="h-2 w-2 rounded-full bg-[var(--primary-color)]"></span>
                      <span className="text-[var(--text-secondary)]">Treatment</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <span className="h-2 w-2 rounded-full bg-[var(--tertiary-color)]"></span>
                      <span className="text-[var(--text-secondary)]">Recovered</span>
                    </div>
                  </div>
                </div>

                {/* SVG Line Chart */}
                <div className="h-64 w-full relative pt-4">
                  <svg className="w-full h-full" viewBox="0 0 500 200" preserveAspectRatio="none">
                    {/* Grid lines */}
                    <line x1="0" y1="50" x2="500" y2="50" stroke="#f5f5f4" strokeWidth="1" />
                    <line x1="0" y1="100" x2="500" y2="100" stroke="#f5f5f4" strokeWidth="1" />
                    <line x1="0" y1="150" x2="500" y2="150" stroke="#f5f5f4" strokeWidth="1" />

                    {/* Under treatment line (primary Calm Cyan) */}
                    <path
                      d="M 10 130 Q 90 90 170 120 T 330 70 T 490 110"
                      fill="none"
                      stroke="var(--primary-color)"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                    {/* Recovered line (tertiary Health Green) */}
                    <path
                      d="M 10 170 Q 90 140 170 160 T 330 130 T 490 120"
                      fill="none"
                      stroke="var(--tertiary-color)"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex justify-between items-end text-[11px] text-stone-400 font-bold px-1.5 pt-2">
                    <span>Sun</span>
                    <span>Mon</span>
                    <span>Tue</span>
                    <span>Wed</span>
                    <span>Thu</span>
                    <span>Fri</span>
                    <span>Sat</span>
                  </div>
                </div>
              </div>

              {/* Right Card: Next Appointments list */}
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-6 shadow-[var(--card-shadow)] flex flex-col space-y-4">
                <div className="pb-2 border-b border-[var(--border-color)]/30">
                  <h4 className="font-extrabold text-[var(--text-color)] text-base">Next in Cabin Queue</h4>
                  <p className="text-[13px] text-[var(--text-secondary)] font-medium">
                    Active and upcoming queue admissions
                  </p>
                </div>

                {recentAppointmentsList.length > 0 ? (
                  <div className="divide-y divide-[var(--border-color)]/30 flex-1 flex flex-col justify-around">
                    {recentAppointmentsList.map((app, i) => (
                      <div key={i} className="py-2.5 flex items-center justify-between text-[13px]">
                        <div className="flex items-center space-x-3">
                          <img
                            src={app.avatar}
                            alt="avatar"
                            className="h-8 w-8 rounded-full bg-[var(--bg-color)] border border-[var(--border-color)]/30 shrink-0"
                          />
                          <div>
                            <p className="font-bold text-[var(--text-color)]">{app.name}</p>
                            <p className="text-[12px] text-[var(--text-secondary)] truncate max-w-36 font-semibold">
                              {app.symptoms}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[12px] font-extrabold bg-[var(--bg-color)] border border-[var(--border-color)]/30 px-2 py-0.5 rounded text-[var(--text-color)]">
                            {app.time}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[var(--text-secondary)] text-[13px] italic py-8 text-center flex-1 flex items-center justify-center">
                    No active appointments in system.
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Row: Doctor availability & Polyclinics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Doctor's availability status summary list */}
              <div className="md:col-span-2 bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-6 shadow-[var(--card-shadow)]">
                <h4 className="font-extrabold text-[var(--text-color)] text-[15px] mb-4">
                  Doctor Schedules & Availability
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {doctors.map((doc) => (
                    <div
                      key={doc._id}
                      className="p-3 bg-[var(--bg-color)] border border-[var(--border-color)]/30 rounded-xl flex justify-between items-center text-[13px]"
                    >
                      <div>
                        <p className="font-bold text-[var(--text-color)]">{doc.name}</p>
                        <p className="text-[12px] text-[var(--text-secondary)] font-medium">
                          {doc.department} | {doc.currentRoom}
                        </p>
                      </div>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          doc.availabilityStatus === 'Available'
                            ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                            : doc.availabilityStatus === 'In Surgery'
                              ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                              : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                        }`}
                      >
                        {doc.availabilityStatus}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Polyclinic summary card */}
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-6 shadow-[var(--card-shadow)] flex flex-col justify-between">
                <div>
                  <h4 className="font-extrabold text-[var(--text-color)] text-[15px] mb-2">
                    Hospital Departments
                  </h4>
                  <p className="text-[13px] text-[var(--text-secondary)] font-semibold mb-4">
                    +35% checkup increase this week
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-[13px]">
                  <div>
                    <p className="text-lg font-black text-[var(--text-color)]">80</p>
                    <p className="text-[11px] text-[var(--text-secondary)] font-bold uppercase tracking-wider">
                      General
                    </p>
                  </div>
                  <div>
                    <p className="text-lg font-black text-[var(--text-color)]">50</p>
                    <p className="text-[11px] text-[var(--text-secondary)] font-bold uppercase tracking-wider">
                      Peds
                    </p>
                  </div>
                  <div>
                    <p className="text-lg font-black text-[var(--text-color)]">40</p>
                    <p className="text-[11px] text-[var(--text-secondary)] font-bold uppercase tracking-wider">
                      Cardio
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Intercom Row */}
            <div className="grid grid-cols-1 gap-8 max-w-2xl mt-8">
              <InternalChatBox token={staffToken} user={staffUser} role="Staff" />
            </div>
          </div>
        )}

        {/* TAB 2: ACTIVE QUEUE MONITOR & WALK-IN REGISTRATION */}
        {activeSidebarTab === 'monitor' && (
          <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden space-y-6 lg:space-y-0 lg:space-x-8 animate-fade-in no-scrollbar">
            {/* Left Form: Walk-in Registration */}
            <div className="w-full lg:w-80 bg-[var(--card-bg)] border border-[var(--border-color)]/30 p-5 rounded-2xl shadow-[var(--card-shadow)] shrink-0 text-[15px]">
              <h3 className="font-extrabold text-[var(--text-color)] text-base mb-4">Walk-in Registry</h3>

              {walkError && (
                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-500 text-[13px] rounded-xl flex items-center space-x-2">
                  <span className="material-symbols-outlined text-[16px] text-rose-500 shrink-0">error</span>
                  <span>{walkError}</span>
                </div>
              )}

              {walkSuccess && (
                <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-550 text-[13px] rounded-xl flex items-center space-x-2">
                  <span className="material-symbols-outlined text-[16px] text-emerald-500 shrink-0">
                    check_circle
                  </span>
                  <span>{walkSuccess}</span>
                </div>
              )}

              <form onSubmit={handleRegisterWalkIn} className="space-y-4">
                <div>
                  <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                    Patient Name
                  </label>
                  <input
                    type="text"
                    value={walkName}
                    onChange={(e) => setWalkName(e.target.value)}
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-2 outline-none text-[var(--text-color)] font-bold"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[var(--text-secondary)] font-semibold mb-1">Age</label>
                    <input
                      type="number"
                      value={walkAge}
                      onChange={(e) => setWalkAge(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-2 outline-none text-[var(--text-color)] font-bold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[var(--text-secondary)] font-semibold mb-1">Gender</label>
                    <select
                      value={walkGender}
                      onChange={(e) => setWalkGender(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-2 outline-none text-[var(--text-color)] font-bold"
                    >
                      <option>Male</option>
                      <option>Female</option>
                      <option>Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={walkPhone}
                    onChange={(e) => setWalkPhone(e.target.value)}
                    placeholder="e.g. +1 555-0100"
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-2 outline-none text-[var(--text-color)] font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] font-semibold mb-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[15px] text-[var(--primary-color)]">
                      auto_awesome
                    </span>
                    Assign Doctor
                  </label>
                  <select
                    value={walkDoctorId}
                    onChange={(e) => setWalkDoctorId(e.target.value)}
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-2 outline-none text-[var(--text-color)] font-bold"
                  >
                    <option value="">🤖 Auto-assign (smart triage — recommended)</option>
                    {doctors.map((doc) => (
                      <option key={doc._id} value={doc._id}>
                        {doc.name} ({doc.department})
                      </option>
                    ))}
                  </select>
                  <p className="text-[12px] text-[var(--text-secondary)] font-medium mt-1">
                    Leave on Auto-assign — the system reads the symptoms, picks the right department & the
                    least-busy doctor.
                  </p>
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                    Symptoms Summary
                  </label>
                  <textarea
                    value={walkSymptoms}
                    onChange={(e) => setWalkSymptoms(e.target.value)}
                    rows={2}
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-2 outline-none text-[var(--text-color)] font-bold resize-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                    Priority Group (auto-detected if left as None)
                  </label>
                  <select
                    value={walkPriority}
                    onChange={(e) => setWalkPriority(e.target.value)}
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-2 outline-none text-[var(--text-color)] font-bold"
                  >
                    <option value="None">None (auto-detect senior/pregnant)</option>
                    <option value="Senior">👵 Senior Citizen</option>
                    <option value="Pregnant">🤰 Pregnant</option>
                    <option value="Disabled">♿ Disabled / Special needs</option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-3 bg-[var(--bg-color)] border border-[var(--border-color)]/30 rounded-xl">
                  <div className="flex items-center space-x-2">
                    <span className="material-symbols-outlined text-rose-500 animate-pulse text-[18px]">
                      local_fire_department
                    </span>
                    <div>
                      <p className="text-[13px] font-bold text-[var(--text-color)]">Emergency SOS</p>
                      <p className="text-[12px] text-[var(--text-secondary)] font-medium">
                        Bypass queue to top
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={walkIsEmergency}
                    onChange={(e) => setWalkIsEmergency(e.target.checked)}
                    className="h-4.5 w-4.5 text-rose-600 focus:ring-rose-500 border-[var(--border-color)] rounded"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-[var(--primary-color)] hover:bg-[var(--primary-container)] text-[var(--primary-text)] hover:text-[var(--text-color)] font-bold py-3 rounded-xl shadow-lg shadow-[var(--primary-color)]/10 transition-all transition-all-custom flex items-center justify-center space-x-2"
                >
                  <span>Register Patient Walk-in</span>
                  <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                </button>
              </form>
            </div>

            {/* Right List: Live Doctor queue monitor cards */}
            <div className="flex-1 lg:overflow-y-auto space-y-6">
              {queues.length === 0 ? (
                <div className="text-[var(--text-secondary)] text-[15px] italic py-8">
                  No hospital queues initialized.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {queues.map((q) => (
                    <div
                      key={q._id}
                      className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-5 flex flex-col space-y-4 shadow-[var(--card-shadow)]"
                    >
                      <div className="flex justify-between items-start pb-3 border-b border-[var(--border-color)]/30">
                        <div>
                          <h4 className="font-extrabold text-[var(--text-color)] text-base">
                            {q.doctor?.name}
                          </h4>
                          <p className="text-[13px] text-[var(--text-secondary)] font-semibold">
                            {q.doctor?.department} | {q.doctor?.currentRoom}
                          </p>
                        </div>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                            q.doctor?.availabilityStatus === 'Available'
                              ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                              : q.doctor?.availabilityStatus === 'In Surgery'
                                ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                                : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                          }`}
                        >
                          {q.doctor?.availabilityStatus}
                        </span>
                      </div>

                      <div className="flex items-center justify-between bg-[var(--bg-color)] p-3 rounded-xl border border-[var(--border-color)]/30">
                        <span className="text-[13px] text-[var(--text-secondary)] font-bold">
                          In Cabin checkup:
                        </span>
                        {q.currentToken ? (
                          <span className="text-[13px] font-bold text-teal-650 bg-teal-500/10 px-3 py-1 rounded-lg border border-teal-500/20">
                            Token {q.currentToken.tokenNumber} ({q.currentToken.tokenType})
                          </span>
                        ) : (
                          <span className="text-[13px] text-[var(--text-secondary)]/50 italic">
                            Idle Cabin
                          </span>
                        )}
                      </div>

                      <div className="flex-1 flex flex-col space-y-2">
                        <span className="text-[12px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">
                          Waiting list ({q.activeQueue?.length || 0})
                        </span>

                        {q.activeQueue && q.activeQueue.filter(Boolean).length > 0 ? (
                          <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                            {q.activeQueue.filter(Boolean).map((tok, idx) => (
                              <div
                                key={tok._id}
                                className={`p-3 rounded-xl border flex items-center justify-between text-[13px] transition-all bg-[var(--card-bg)] ${
                                  tok.tokenType === 'Emergency'
                                    ? 'animate-flashing-emergency border-rose-500/40 bg-rose-500/5'
                                    : 'border-[var(--border-color)] hover:border-[var(--text-secondary)]/30'
                                }`}
                              >
                                <div>
                                  <div className="flex items-center space-x-2">
                                    <span className="font-extrabold text-[var(--text-color)]">
                                      {tok.tokenNumber}
                                    </span>
                                    <span className="text-[12px] text-[var(--text-secondary)] font-semibold">
                                      ({tok.patient?.name})
                                    </span>
                                  </div>
                                  <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 truncate max-w-44 font-semibold">
                                    Sym: {tok.symptoms}
                                  </p>
                                </div>

                                <div className="flex items-center space-x-1">
                                  {tok.tokenType !== 'Emergency' && (
                                    <button
                                      onClick={() => handleEmergencyOverride(tok._id)}
                                      className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-500 font-bold px-2 py-1 rounded transition-all text-[11px]"
                                      title="Emergency Override"
                                    >
                                      SOS
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleStatusChange(tok._id, 'Absent')}
                                    className="bg-[var(--bg-color)] hover:bg-[var(--border-color)]/30 text-[var(--text-color)] border border-[var(--border-color)] px-2 py-1 rounded transition-all text-[11px] font-bold"
                                  >
                                    Absent
                                  </button>
                                  <button
                                    onClick={() => handleStatusChange(tok._id, 'Completed')}
                                    className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-555 font-bold px-2 py-1 rounded transition-all text-[11px]"
                                  >
                                    Done
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[13px] text-[var(--text-secondary)]/50 italic py-2">
                            No patients currently waiting.
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: PATIENT MANAGEMENT REGISTRY */}
        {activeSidebarTab === 'patients' && (
          <div className="space-y-6 animate-fade-in text-[var(--text-color)]">
            {/* Toolbar search & Add Button */}
            <div className="flex justify-between items-center bg-[var(--card-bg)] border border-[var(--border-color)]/30 p-4 rounded-xl shadow-[var(--card-shadow)]">
              <div className="relative max-w-xs w-full">
                <input
                  type="text"
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  placeholder="Search by name or phone..."
                  className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] focus:border-[var(--primary-color)] rounded-xl px-4 py-2 outline-none text-[13px] text-[var(--text-color)] font-semibold"
                />
              </div>

              <button
                onClick={() => {
                  setPatName('');
                  setPatPhone('');
                  setPatAge('');
                  setPatGender('Male');
                  setPatError('');
                  setPatSuccess('');
                  setShowAddPatientModal(true);
                }}
                className="bg-[var(--primary-color)] hover:bg-[var(--primary-container)] text-[var(--primary-text)] hover:text-[var(--text-color)] text-[13px] font-bold px-4 py-2.5 rounded-xl transition-all transition-all-custom shadow-sm flex items-center space-x-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">person_add</span>
                <span>Add New Patient</span>
              </button>
            </div>

            {/* Patients directory table card */}
            <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl overflow-hidden shadow-[var(--card-shadow)] flex-1">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px] border-collapse">
                  <thead>
                    <tr className="bg-[var(--bg-color)]/50 border-b border-[var(--border-color)]/30 font-bold text-[var(--text-secondary)] uppercase tracking-wider text-[12px]">
                      <th className="p-4">Patient Name</th>
                      <th className="p-4">Phone Number</th>
                      <th className="p-4">Age</th>
                      <th className="p-4">Gender</th>
                      <th className="p-4 text-center">Visit Count</th>
                      <th className="p-4">Registered Date</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)]/20 text-[var(--text-color)] font-medium">
                    {filteredPatients.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="p-8 text-center text-[var(--text-secondary)]/50 italic">
                          No patient records match the criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredPatients.map((pat) => (
                        <tr key={pat._id} className="hover:bg-[var(--border-color)]/10 transition-all">
                          <td className="p-4 whitespace-nowrap font-bold text-[var(--text-color)]">
                            {pat.name}
                          </td>
                          <td className="p-4 whitespace-nowrap font-semibold text-[var(--text-secondary)]">
                            {pat.phone}
                          </td>
                          <td className="p-4 whitespace-nowrap font-bold text-[var(--text-color)]">
                            {pat.age} years
                          </td>
                          <td className="p-4 whitespace-nowrap text-[var(--text-secondary)] font-semibold">
                            {pat.gender}
                          </td>
                          <td className="p-4 text-center font-black text-[var(--secondary-color)]">
                            {pat.visitCount || 1}
                          </td>
                          <td className="p-4 whitespace-nowrap text-[var(--text-secondary)]">
                            {new Date(pat.createdAt || Date.now()).toLocaleDateString()}
                          </td>
                          <td className="p-4 text-right whitespace-nowrap space-x-2">
                            <button
                              onClick={() => {
                                setSelectedPatient(pat);
                                setPatName(pat.name);
                                setPatPhone(pat.phone);
                                setPatAge(pat.age);
                                setPatGender(pat.gender);
                                setPatError('');
                                setPatSuccess('');
                                setShowEditPatientModal(true);
                              }}
                              className="bg-[var(--bg-color)] border border-[var(--border-color)] hover:border-[var(--secondary-color)] text-[var(--text-color)] font-bold px-3 py-1.5 rounded-lg transition-all text-[13px]"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SMS REMINDERS LOGS */}
        {activeSidebarTab === 'reminders' && (
          <div className="flex-1 flex flex-col space-y-6 animate-fade-in text-[var(--text-color)]">
            {/* Trigger controller */}
            <div className="flex justify-between items-center bg-[var(--card-bg)] border border-[var(--border-color)]/30 p-4 rounded-xl shadow-[var(--card-shadow)]">
              <div>
                <h4 className="font-extrabold text-[var(--text-color)] text-[15px]">
                  Dispatched Reminder Logs
                </h4>
                <p className="text-[12px] text-[var(--text-secondary)] font-medium">
                  Manually dispatch pending re-visit SMS notifications scheduled for today.
                </p>
              </div>
              <button
                onClick={handleTriggerReminders}
                className="bg-[var(--secondary-color)] hover:bg-[var(--secondary-color)]/95 text-white text-[13px] font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center space-x-1.5"
              >
                <span className="material-symbols-outlined text-[16px] animate-spin">autorenew</span>
                <span>Trigger Pending Reminders</span>
              </button>
            </div>

            {triggerLog && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-[13px] space-y-2 text-emerald-600 animate-fade-in shadow-sm">
                <div className="flex items-center space-x-2">
                  <span className="material-symbols-outlined text-[16px] text-emerald-500">check_circle</span>
                  <span className="font-bold">
                    Reminders Dispatched Successfully! ({triggerLog.length} sent)
                  </span>
                </div>
                {triggerLog.length > 0 ? (
                  <div className="max-h-24 overflow-y-auto space-y-1.5 pr-1">
                    {triggerLog.map((log, idx) => (
                      <div
                        key={idx}
                        className="bg-[var(--card-bg)] p-2 rounded border border-[var(--border-color)]/30"
                      >
                        <p className="font-bold text-[var(--text-color)]">
                          To: {log.patientName} ({log.patientPhone}) | Doctor: {log.doctorName}
                        </p>
                        <p className="text-[var(--text-secondary)] mt-0.5 font-medium">"{log.message}"</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="font-medium text-[var(--text-secondary)]">
                    No pending reminders were scheduled for today or earlier.
                  </p>
                )}
              </div>
            )}

            {/* Reminders table grid */}
            <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl overflow-hidden shadow-[var(--card-shadow)] flex-1">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px] border-collapse">
                  <thead>
                    <tr className="bg-[var(--bg-color)]/50 border-b border-[var(--border-color)]/30 font-bold text-[var(--text-secondary)] uppercase tracking-wider text-[12px]">
                      <th className="p-4">Created</th>
                      <th className="p-4">Patient</th>
                      <th className="p-4">Doctor</th>
                      <th className="p-4">Scheduled Date</th>
                      <th className="p-4">Interval</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)]/20 text-[var(--text-color)] font-medium">
                    {remindersLoading ? (
                      <tr>
                        <td colSpan="7" className="p-8 text-center text-[var(--text-secondary)]/50 italic">
                          Loading reminders...
                        </td>
                      </tr>
                    ) : reminders.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="p-8 text-center text-[var(--text-secondary)]/50 italic">
                          No scheduled reminders recorded in system database.
                        </td>
                      </tr>
                    ) : (
                      reminders.map((rem) => (
                        <tr key={rem._id} className="hover:bg-[var(--border-color)]/10 transition-all">
                          <td className="p-4 whitespace-nowrap text-[var(--text-secondary)]">
                            {new Date(rem.createdAt).toLocaleDateString()}
                          </td>
                          <td className="p-4 whitespace-nowrap">
                            <div className="font-bold text-[var(--text-color)]">
                              {rem.patient?.name || 'Patient'}
                            </div>
                            <div className="text-[12px] text-[var(--text-secondary)]">
                              {rem.patient?.phone}
                            </div>
                          </td>
                          <td className="p-4 whitespace-nowrap">
                            <div className="font-bold text-[var(--text-color)]">
                              {rem.doctor?.name || 'Doctor'}
                            </div>
                            <div className="text-[12px] text-[var(--text-secondary)]">
                              {rem.doctor?.department}
                            </div>
                          </td>
                          <td className="p-4 whitespace-nowrap text-[var(--text-color)] font-black">
                            {new Date(rem.scheduledDate).toLocaleDateString()}
                          </td>
                          <td className="p-4 whitespace-nowrap font-bold text-[var(--text-color)]">
                            {rem.revisitDays} days
                          </td>
                          <td className="p-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[12px] font-bold border ${
                                rem.status === 'Pending'
                                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                                  : rem.status === 'Sent'
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-555'
                                    : 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                              }`}
                            >
                              {rem.status}
                            </span>
                          </td>
                          <td
                            className="p-4 max-w-56 truncate text-[var(--text-secondary)] font-medium"
                            title={rem.message}
                          >
                            {rem.message}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: SPECIAL RECEPTION DESK — patients who booked from home.
              A WhatsApp booking arrives with nobody standing at the counter: no
              one to judge that the patient is 78 and should go ahead of the line,
              and no one to start their bill. This desk is where reception works
              those arrivals — the facility's own, and only its own. */}
        {activeSidebarTab === 'reception' && (
          <div className="space-y-6 animate-fade-in text-left">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-5 shadow-sm">
              <div>
                <h3 className="text-lg font-extrabold text-[var(--text-color)] tracking-tight flex items-center gap-2">
                  <span className="material-symbols-outlined text-[24px] text-emerald-600">
                    support_agent
                  </span>
                  <span>Special Reception Desk</span>
                </h3>
                <p className="text-[13px] text-[var(--text-secondary)] font-medium mt-0.5">
                  Every patient who booked at{' '}
                  <span className="font-bold text-emerald-600">
                    {billingConfig?.displayName || staffUser?.hospital || 'this facility'}
                  </span>{' '}
                  today — including WhatsApp bookings made from home. Give special-needs priority and open
                  their bill without re-registering them.
                </p>
              </div>

              <button
                onClick={loadArrivals}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[13px] rounded-xl shadow-sm transition-all flex items-center space-x-1"
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span>
                <span>Refresh</span>
              </button>
            </div>

            {arrivalError && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-400 rounded-xl px-4 py-3 text-[13px] font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">error</span>
                <span className="flex-1">{arrivalError}</span>
                <button
                  onClick={() => setArrivalError('')}
                  className="text-[12px] font-black opacity-60 hover:opacity-100"
                >
                  DISMISS
                </button>
              </div>
            )}
            {arrivalNotice && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 rounded-xl px-4 py-3 text-[13px] font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                <span>{arrivalNotice}</span>
              </div>
            )}

            {/* Today at a glance */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {[
                {
                  label: 'Arrivals today',
                  value: arrivalSummary?.total ?? 0,
                  tone: 'text-[var(--text-color)]'
                },
                {
                  label: 'Booked on WhatsApp',
                  value: arrivalSummary?.whatsapp ?? 0,
                  tone: 'text-emerald-600'
                },
                { label: 'Booked at counter', value: arrivalSummary?.walkIn ?? 0, tone: 'text-sky-600' },
                {
                  label: 'Priority / emergency',
                  value: arrivalSummary?.special ?? 0,
                  tone: 'text-amber-600'
                },
                { label: 'No bill opened', value: arrivalSummary?.unbilled ?? 0, tone: 'text-rose-500' },
                {
                  label: 'Collected today',
                  value: `${currency}${arrivalSummary?.collectedToday ?? 0}`,
                  tone: 'text-teal-600'
                }
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-4 shadow-sm"
                >
                  <p className={`text-2xl font-black tracking-tight ${stat.tone}`}>{stat.value}</p>
                  <p className="text-[12px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mt-0.5">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { id: 'remote', label: 'Booked from home' },
                { id: 'special', label: 'Priority & emergency' },
                { id: 'unbilled', label: 'Bill not settled' },
                { id: 'all', label: 'Everyone today' }
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setArrivalFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-[13px] font-bold transition-all border ${
                    arrivalFilter === f.id
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border-[var(--border-color)]/40 hover:text-[var(--text-color)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <span className="text-[12px] bg-emerald-500/10 text-emerald-600 px-2 py-1 rounded-full font-bold ml-auto">
                Live — new WhatsApp bookings appear here on their own
              </span>
            </div>

            {/* Arrivals */}
            {visibleArrivals.length === 0 ? (
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl py-16 text-center shadow-sm">
                <span className="material-symbols-outlined text-[36px] text-[var(--text-secondary)]">
                  inbox
                </span>
                <p className="text-[13px] text-[var(--text-secondary)] font-semibold mt-2">
                  {arrivalFilter === 'remote'
                    ? 'No online bookings yet today. A patient who says "hi" on WhatsApp and picks this hospital shows up here instantly.'
                    : 'Nothing matches this filter today.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {visibleArrivals.map((a) => {
                  const badge = SOURCE_BADGE[a.bookingSource] || SOURCE_BADGE.Reception;
                  const busy = arrivalBusyId === a.tokenId;
                  return (
                    <div
                      key={a.tokenId}
                      className={`bg-[var(--card-bg)] border rounded-2xl p-4 shadow-sm space-y-3 ${
                        a.tokenType === 'Emergency'
                          ? 'border-rose-500/50'
                          : a.priorityCategory !== 'None'
                            ? 'border-amber-500/40'
                            : 'border-[var(--border-color)]/30'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[12px] font-black text-emerald-600 uppercase tracking-widest">
                              {a.tokenNumber}
                            </span>
                            <span
                              className={`text-[11px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider border flex items-center gap-1 ${badge.className}`}
                            >
                              <span className="material-symbols-outlined text-[12px]">{badge.icon}</span>
                              {a.bookingSource}
                            </span>
                            {a.tokenType === 'Emergency' && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider bg-rose-500/10 text-rose-600 border border-rose-500/20">
                                🚨 Emergency
                              </span>
                            )}
                            {a.priorityCategory !== 'None' && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                {a.priorityCategory} priority
                              </span>
                            )}
                          </div>
                          <h4 className="font-extrabold text-[15px] text-[var(--text-color)] mt-1 truncate">
                            {a.patient?.name || 'Patient'}
                            <span className="text-[var(--text-secondary)] font-semibold text-[13px]">
                              {a.patient?.age ? ` · ${a.patient.age}` : ''}
                              {a.patient?.gender ? ` · ${a.patient.gender}` : ''}
                            </span>
                          </h4>
                          <p className="text-[12px] text-[var(--text-secondary)] font-medium truncate">
                            {a.patient?.phone} · {a.doctor?.name || 'Doctor'} ({a.doctor?.department}) ·{' '}
                            {a.doctor?.currentRoom || 'Cabin'}
                          </p>
                          <p className="text-[12px] text-[var(--text-secondary)] font-medium mt-1 line-clamp-2">
                            “{a.symptoms}”
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider bg-[var(--bg-color)] border border-[var(--border-color)]/40 text-[var(--text-secondary)]">
                            {a.status}
                          </span>
                          <p className="text-[12px] text-[var(--text-secondary)] font-semibold mt-1">
                            {a.bookedAt ? new Date(a.bookedAt).toLocaleTimeString() : ''}
                          </p>
                          <p className="text-[12px] text-[var(--text-secondary)] font-semibold">
                            ~{a.estimatedWaitTime} min wait
                          </p>
                        </div>
                      </div>

                      {/* Special-needs priority — the counter decision that a
                            remote booking never gets made for it. */}
                      <div className="flex items-center gap-1.5 flex-wrap border-t border-[var(--border-color)]/30 pt-3">
                        <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mr-1">
                          Priority
                        </span>
                        {PRIORITY_OPTIONS.map((p) => (
                          <button
                            key={p.value}
                            disabled={busy || a.priorityCategory === p.value}
                            onClick={() => handleSetArrivalPriority(a.tokenId, p.value)}
                            className={`px-2.5 py-1 rounded-lg text-[12px] font-bold border transition-all disabled:opacity-100 ${
                              a.priorityCategory === p.value
                                ? 'bg-amber-500/15 text-amber-600 border-amber-500/30 cursor-default'
                                : 'bg-[var(--bg-color)] text-[var(--text-secondary)] border-[var(--border-color)]/40 hover:text-[var(--text-color)] hover:border-amber-500/40 disabled:opacity-40'
                            }`}
                          >
                            {p.icon} {p.label}
                          </button>
                        ))}
                      </div>

                      {/* Billing */}
                      <div className="flex items-center justify-between gap-3 border-t border-[var(--border-color)]/30 pt-3">
                        <div className="text-[12px] font-semibold text-[var(--text-secondary)]">
                          {a.bill ? (
                            <>
                              <span className="font-black text-teal-600">{a.bill.invoiceNumber}</span> ·{' '}
                              {a.bill.status} · Total {currency}
                              {a.bill.totalAmount}
                              {a.bill.balanceDue > 0 && (
                                <span className="text-rose-500 font-black">
                                  {' '}
                                  · Due {currency}
                                  {a.bill.balanceDue}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-rose-500 font-bold">No bill opened yet</span>
                          )}
                        </div>
                        <button
                          disabled={busy}
                          onClick={() => handleBillArrival(a.tokenId)}
                          className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold text-[13px] rounded-lg shadow-sm transition-all flex items-center gap-1 shrink-0"
                        >
                          <span className="material-symbols-outlined text-[14px]">receipt_long</span>
                          <span>{a.bill ? 'Open bill' : 'Start bill'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: RECEPTION PATIENT BILLING & DISCHARGE COUNTER */}
        {activeSidebarTab === 'billing' && (
          <div className="space-y-6 animate-fade-in text-left">
            {/* Top Header & Search bar */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-5 shadow-sm">
              <div>
                <h3 className="text-lg font-extrabold text-[var(--text-color)] tracking-tight flex items-center gap-2">
                  <span className="material-symbols-outlined text-[24px] text-teal-600">payments</span>
                  <span>Billing</span>
                </h3>
                <p className="text-[13px] text-[var(--text-secondary)] font-medium mt-0.5">
                  Track daily medicines (dawa), lab tests, bandages, room charges, and generate final
                  discharge invoices — at{' '}
                  <span className="font-bold text-teal-600">
                    {billingConfig?.displayName || staffUser?.hospital || 'this facility'}
                  </span>
                  &apos;s own rates.
                </p>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
                <div className="relative flex-1 md:w-56">
                  <span className="material-symbols-outlined absolute left-3 top-2.5 text-[18px] text-[var(--text-secondary)]">
                    search
                  </span>
                  <input
                    type="text"
                    placeholder="Search patient, phone, token..."
                    value={billingSearch}
                    onChange={(e) => setBillingSearch(e.target.value)}
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-xl pl-9 pr-4 py-2 text-[13px] font-bold text-[var(--text-color)] outline-none focus:border-teal-500"
                  />
                </div>
                <button
                  onClick={() => {
                    setNewBillError('');
                    setShowNewBillModal(true);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[13px] rounded-xl shadow-sm transition-all flex items-center space-x-1"
                  title="Open a bill for any patient — even a walk-in with no token"
                >
                  <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                  <span>New Bill</span>
                </button>
                <button
                  onClick={() => {
                    setRateForm({ ...(billingConfig || {}) });
                    setRateError('');
                    setShowRateCardModal(true);
                  }}
                  className="px-4 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] hover:border-teal-500 text-[var(--text-color)] font-bold text-[13px] rounded-xl transition-all flex items-center space-x-1"
                  title="Set this hospital's own prices, tax and invoice letterhead"
                >
                  <span className="material-symbols-outlined text-[16px]">price_change</span>
                  <span>Rate Card</span>
                </button>
                <button
                  onClick={loadInvoices}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold text-[13px] rounded-xl shadow-sm transition-all flex items-center space-x-1"
                >
                  <span className="material-symbols-outlined text-[16px]">refresh</span>
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Split Screen Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left List Pane: Invoices / Patients */}
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-4 shadow-sm flex flex-col space-y-3 max-h-[70vh] overflow-y-auto">
                <div className="flex justify-between items-center pb-2 border-b border-[var(--border-color)]/30">
                  <span className="text-[13px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                    Patient Bills ({filteredInvoices.length})
                  </span>
                  <span className="text-[12px] bg-teal-500/10 text-teal-600 px-2 py-0.5 rounded-full font-bold">
                    Real-Time Live
                  </span>
                </div>

                {filteredInvoices.length === 0 ? (
                  <div className="py-12 text-center text-[13px] text-[var(--text-secondary)] font-medium">
                    No patient invoices found.
                  </div>
                ) : (
                  filteredInvoices.map((inv) => {
                    const isSelected = selectedInvoice?._id === inv._id;
                    return (
                      <div
                        key={inv._id}
                        onClick={() => setSelectedInvoice(inv)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-teal-500/10 border-teal-500 text-teal-700 dark:text-teal-400 shadow-sm'
                            : 'bg-[var(--bg-color)] border-[var(--border-color)]/40 hover:bg-[var(--border-color)]/20 text-[var(--text-color)]'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[12px] font-black text-teal-600 uppercase tracking-widest block">
                              {inv.invoiceNumber}
                            </span>
                            <h4 className="font-extrabold text-[15px] mt-0.5">
                              {inv.patient?.name || 'Patient'}
                            </h4>
                            <p className="text-[12px] text-[var(--text-secondary)] font-medium">
                              Phone: {inv.patient?.phone}{' '}
                              {inv.token?.tokenNumber ? `| Token: ${inv.token.tokenNumber}` : ''}
                            </p>
                          </div>
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider ${
                              inv.status === 'Discharged'
                                ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                            }`}
                          >
                            {inv.status}
                          </span>
                        </div>

                        <div className="mt-3 pt-2 border-t border-[var(--border-color)]/20 flex justify-between items-center text-[13px]">
                          <span className="text-[12px] text-[var(--text-secondary)]">
                            Items: {(inv.items || []).length}
                          </span>
                          <div className="text-right">
                            <span className="text-[12px] text-[var(--text-secondary)] font-medium">
                              Total:{' '}
                            </span>
                            <span className="font-extrabold text-[15px]">₹{inv.totalAmount}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Right Main Pane: Active Invoice Details & Actions */}
              <div className="lg:col-span-2 space-y-6">
                {selectedInvoice ? (
                  <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-6 shadow-sm space-y-6">
                    {/* Header details */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-[var(--border-color)]/30">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-[13px] font-black uppercase text-teal-600 tracking-wider">
                            {selectedInvoice.invoiceNumber}
                          </span>
                          <span className="text-[13px] text-[var(--text-secondary)]">•</span>
                          <span className="text-[13px] font-bold text-[var(--text-secondary)]">
                            {(selectedInvoice.hospital || 'GENERAL-HOSPITAL').toUpperCase()}
                          </span>
                        </div>
                        <h2 className="text-2xl font-black text-[var(--text-color)] mt-1">
                          {selectedInvoice.patient?.name || 'Patient'}
                        </h2>
                        <p className="text-[13px] text-[var(--text-secondary)] font-medium mt-0.5">
                          Age: {selectedInvoice.patient?.age} | Gender: {selectedInvoice.patient?.gender} |
                          Phone: {selectedInvoice.patient?.phone}
                        </p>
                      </div>

                      {/* Action Toolbar */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => setShowAddItemModal(true)}
                          disabled={selectedInvoice.status === 'Discharged'}
                          className="px-3.5 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold text-[13px] rounded-xl shadow-sm transition-all flex items-center space-x-1.5"
                        >
                          <span className="material-symbols-outlined text-[16px]">add_circle</span>
                          <span>Add Expense</span>
                        </button>

                        <button
                          onClick={handleSyncPrescriptions}
                          disabled={selectedInvoice.status === 'Discharged'}
                          className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-[13px] rounded-xl shadow-sm transition-all flex items-center space-x-1.5"
                          title="Auto-pull doctor prescribed medicines and ordered tests"
                        >
                          <span className="material-symbols-outlined text-[16px]">sync</span>
                          <span>Pull Doctor Rx / Tests</span>
                        </button>

                        <button
                          onClick={() => setShowReceiptModal(true)}
                          className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-[13px] rounded-xl shadow-sm transition-all flex items-center space-x-1.5"
                          title="Generate and print vector PDF invoice on-demand"
                        >
                          <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                          <span>PDF Invoice</span>
                        </button>

                        <button
                          onClick={() => {
                            setDischargeAmountPaid(selectedInvoice.balanceDue.toString());
                            setShowDischargeModal(true);
                          }}
                          disabled={selectedInvoice.status === 'Discharged'}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-[13px] rounded-xl shadow-sm transition-all flex items-center space-x-1.5"
                        >
                          <span className="material-symbols-outlined text-[16px]">task_alt</span>
                          <span>Discharge & Pay</span>
                        </button>
                      </div>
                    </div>

                    {/* Line Items Table */}
                    <div className="space-y-3">
                      <h4 className="text-[13px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                        Itemized Expenses Breakdown
                      </h4>

                      <div className="overflow-x-auto border border-[var(--border-color)]/30 rounded-xl">
                        <table className="w-full text-left text-[13px]">
                          <thead className="bg-[var(--bg-color)] border-b border-[var(--border-color)]/30 text-[var(--text-secondary)] uppercase font-bold text-[12px]">
                            <tr>
                              <th className="p-3">Category</th>
                              <th className="p-3">Item Description</th>
                              <th className="p-3 text-center">Qty</th>
                              <th className="p-3 text-right">Unit Price (₹)</th>
                              <th className="p-3 text-right">Total (₹)</th>
                              <th className="p-3 text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-color)]/20 font-medium">
                            {(selectedInvoice.items || []).length === 0 ? (
                              <tr>
                                <td
                                  colSpan="6"
                                  className="p-6 text-center text-[var(--text-secondary)] italic"
                                >
                                  No charges added yet. Click "Add Expense" or "Pull Doctor Rx / Tests" to
                                  begin.
                                </td>
                              </tr>
                            ) : (
                              selectedInvoice.items.map((it) => (
                                <tr key={it._id} className="hover:bg-[var(--bg-color)]/50">
                                  <td className="p-3">
                                    <span className="px-2 py-0.5 rounded text-[11px] font-black uppercase border bg-teal-500/10 text-teal-600 border-teal-500/20">
                                      {it.category}
                                    </span>
                                  </td>
                                  <td className="p-3 font-bold text-[var(--text-color)]">{it.itemName}</td>
                                  <td className="p-3 text-center font-bold">{it.quantity}</td>
                                  <td className="p-3 text-right font-semibold">₹{it.unitPrice}</td>
                                  <td className="p-3 text-right font-extrabold text-teal-600">
                                    ₹{it.totalPrice}
                                  </td>
                                  <td className="p-3 text-center">
                                    {selectedInvoice.status !== 'Discharged' && (
                                      <button
                                        onClick={() => handleRemoveInvoiceItem(it._id)}
                                        className="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-500/10"
                                        title="Remove item"
                                      >
                                        <span className="material-symbols-outlined text-[16px]">delete</span>
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Bill Totals & Summary Card */}
                    <div className="bg-[var(--bg-color)] border border-[var(--border-color)]/40 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-[13px] font-bold">
                      <div className="space-y-1 text-left">
                        <p className="text-[var(--text-secondary)]">
                          Payment Status:{' '}
                          <span className="font-extrabold text-[var(--text-color)]">
                            {selectedInvoice.paymentMethod || 'Unpaid'}
                          </span>
                        </p>
                        {selectedInvoice.dischargedAt && (
                          <p className="text-[12px] text-emerald-600 font-bold">
                            Discharged at: {new Date(selectedInvoice.dischargedAt).toLocaleString()} by{' '}
                            {selectedInvoice.dischargedBy}
                          </p>
                        )}
                      </div>

                      <div className="w-full sm:w-64 space-y-1.5 border-t sm:border-t-0 sm:border-l border-[var(--border-color)]/30 pt-3 sm:pt-0 sm:pl-4 text-right">
                        <div className="flex justify-between text-[var(--text-secondary)]">
                          <span>Subtotal:</span>
                          <span>
                            {currency}
                            {selectedInvoice.subtotal}
                          </span>
                        </div>
                        {selectedInvoice.discount > 0 && (
                          <div className="flex justify-between text-emerald-600">
                            <span>Discount:</span>
                            <span>
                              -{currency}
                              {selectedInvoice.discount}
                            </span>
                          </div>
                        )}
                        {selectedInvoice.tax > 0 && (
                          <div className="flex justify-between text-[var(--text-secondary)]">
                            <span>Tax ({billingConfig?.taxPercent || 0}%):</span>
                            <span>
                              {currency}
                              {selectedInvoice.tax}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between text-base font-black text-[var(--text-color)] pt-1 border-t border-[var(--border-color)]/30">
                          <span>Total Amount:</span>
                          <span className="text-teal-600">
                            {currency}
                            {selectedInvoice.totalAmount}
                          </span>
                        </div>
                        <div className="flex justify-between text-[13px] font-bold pt-1">
                          <span className="text-[var(--text-secondary)]">
                            Amount Paid: ₹{selectedInvoice.amountPaid}
                          </span>
                          <span
                            className={
                              selectedInvoice.balanceDue > 0
                                ? 'text-amber-600 font-black'
                                : 'text-emerald-600 font-black'
                            }
                          >
                            Due: ₹{selectedInvoice.balanceDue}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[var(--card-bg)] border border-dashed border-[var(--border-color)] rounded-2xl p-16 text-center text-[var(--text-secondary)] space-y-3">
                    <span className="material-symbols-outlined text-[48px] text-[var(--text-secondary)]/40">
                      receipt_long
                    </span>
                    <h3 className="text-base font-extrabold text-[var(--text-color)]">No Invoice Selected</h3>
                    <p className="text-[13px] max-w-sm mx-auto font-medium">
                      Select a patient invoice from the list on the left, or search for a patient/token to
                      manage expenses and discharge.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Add Patient Dialog Modal popup */}
      {showAddPatientModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/40 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-fade-in relative text-[var(--text-color)]">
            <h3 className="font-extrabold text-[var(--text-color)] text-base mb-4 flex items-center space-x-2 border-b border-[var(--border-color)]/30 pb-2">
              <span className="material-symbols-outlined text-[var(--secondary-color)]">person_add</span>
              <span>Add Patient Record</span>
            </h3>

            {patError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-500 text-[13px] rounded-xl">
                {patError}
              </div>
            )}

            {patSuccess && (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-555 text-[13px] rounded-xl">
                {patSuccess}
              </div>
            )}

            <form onSubmit={handleAddPatient} className="space-y-4 text-[13px] font-semibold">
              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Patient Full Name</label>
                <input
                  type="text"
                  value={patName}
                  onChange={(e) => setPatName(e.target.value)}
                  className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--secondary-color)] rounded-xl px-4 py-2.5 outline-none font-bold text-[var(--text-color)]"
                  required
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Phone Number</label>
                <input
                  type="text"
                  value={patPhone}
                  onChange={(e) => setPatPhone(e.target.value)}
                  placeholder="e.g. +1 555-0100"
                  className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--secondary-color)] rounded-xl px-4 py-2.5 outline-none font-bold text-[var(--text-color)]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Age</label>
                  <input
                    type="number"
                    value={patAge}
                    onChange={(e) => setPatAge(e.target.value)}
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--secondary-color)] rounded-xl px-4 py-2.5 outline-none font-bold text-[var(--text-color)]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Gender</label>
                  <select
                    value={patGender}
                    onChange={(e) => setPatGender(e.target.value)}
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--secondary-color)] rounded-xl px-4 py-2.5 outline-none font-bold text-[var(--text-color)]"
                  >
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              <div className="flex space-x-3 pt-2 text-[15px] font-bold">
                <button
                  type="button"
                  onClick={() => setShowAddPatientModal(false)}
                  className="flex-1 py-3 border border-[var(--border-color)] text-[var(--text-secondary)] rounded-xl hover:bg-[var(--border-color)]/20 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-[var(--secondary-color)] hover:bg-[var(--secondary-color)]/95 text-white rounded-xl shadow-lg shadow-[var(--secondary-color)]/10 transition-all"
                >
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Edit Patient Dialog Modal popup */}
      {showEditPatientModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/40 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-fade-in relative text-[var(--text-color)]">
            <h3 className="font-extrabold text-[var(--text-color)] text-base mb-4 flex items-center space-x-2 border-b border-[var(--border-color)]/30 pb-2">
              <span className="material-symbols-outlined text-[var(--secondary-color)]">edit</span>
              <span>Edit Patient Record</span>
            </h3>

            {patError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-500 text-[13px] rounded-xl">
                {patError}
              </div>
            )}

            {patSuccess && (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-555 text-[13px] rounded-xl">
                {patSuccess}
              </div>
            )}

            <form onSubmit={handleEditPatient} className="space-y-4 text-[13px] font-semibold">
              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Patient Full Name</label>
                <input
                  type="text"
                  value={patName}
                  onChange={(e) => setPatName(e.target.value)}
                  className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--secondary-color)] rounded-xl px-4 py-2.5 outline-none font-bold text-[var(--text-color)]"
                  required
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Phone Number</label>
                <input
                  type="text"
                  value={patPhone}
                  onChange={(e) => setPatPhone(e.target.value)}
                  className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--secondary-color)] rounded-xl px-4 py-2.5 outline-none font-bold text-[var(--text-color)]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Age</label>
                  <input
                    type="number"
                    value={patAge}
                    onChange={(e) => setPatAge(e.target.value)}
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--secondary-color)] rounded-xl px-4 py-2.5 outline-none font-bold text-[var(--text-color)]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Gender</label>
                  <select
                    value={patGender}
                    onChange={(e) => setPatGender(e.target.value)}
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--secondary-color)] rounded-xl px-4 py-2.5 outline-none font-bold text-[var(--text-color)]"
                  >
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              <div className="flex space-x-3 pt-2 text-[15px] font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditPatientModal(false);
                    setSelectedPatient(null);
                  }}
                  className="flex-1 py-3 border border-[var(--border-color)] text-[var(--text-secondary)] rounded-xl hover:bg-[var(--border-color)]/20 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-[var(--secondary-color)] hover:bg-[var(--secondary-color)]/95 text-white rounded-xl shadow-lg shadow-[var(--secondary-color)]/10 transition-all"
                >
                  Update Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Add Expense / Charge Modal */}
      {showAddItemModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/40 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-fade-in relative text-[var(--text-color)] text-left">
            <h3 className="font-extrabold text-base mb-4 flex items-center space-x-2 border-b border-[var(--border-color)]/30 pb-2">
              <span className="material-symbols-outlined text-teal-600">add_shopping_cart</span>
              <span>Add charge</span>
            </h3>

            {addItemError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-500 text-[13px] rounded-xl font-bold">
                {addItemError}
              </div>
            )}
            {addItemSuccess && (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-[13px] rounded-xl font-bold">
                {addItemSuccess}
              </div>
            )}

            {/* This facility's rate card — one tap fills the charge. Prices come
                from the hospital's own catalogue, so nothing here is hardcoded. */}
            <div className="mb-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-extrabold uppercase text-[var(--text-secondary)]">
                  {billingConfig?.displayName || 'Facility'} Rate Card
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setRateForm({ ...(billingConfig || {}) });
                    setShowAddItemModal(false);
                    setShowRateCardModal(true);
                  }}
                  className="text-[12px] font-bold text-teal-600 hover:underline"
                >
                  Edit prices
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[12px] max-h-32 overflow-y-auto">
                {(billingConfig?.services || []).filter((svc) => svc.active !== false).length === 0 ? (
                  <span className="text-[12px] text-[var(--text-secondary)] italic">
                    No services priced yet — add them from the Rate Card.
                  </span>
                ) : (
                  (billingConfig.services || [])
                    .filter((svc) => svc.active !== false)
                    .map((svc) => (
                      <button
                        key={svc._id || svc.name}
                        type="button"
                        onClick={() => {
                          setAddItemCategory(svc.category);
                          setAddItemName(svc.name);
                          setAddItemPrice(String(svc.price));
                        }}
                        className={`px-2 py-1 rounded-lg font-bold transition-colors ${CATEGORY_CHIP[svc.category] || CATEGORY_CHIP.Other}`}
                        title={`${svc.category} — ${currency}${svc.price}`}
                      >
                        {svc.name} ({currency}
                        {svc.price})
                      </button>
                    ))
                )}
              </div>
            </div>

            <form onSubmit={handleAddInvoiceItem} className="space-y-4">
              <div>
                <label className="block text-[13px] font-bold mb-1">Category</label>
                <select
                  value={addItemCategory}
                  onChange={(e) => setAddItemCategory(e.target.value)}
                  className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-xl p-2.5 text-[13px] font-bold text-[var(--text-color)]"
                >
                  <option value="Medicine">Medicine (Dawa)</option>
                  <option value="Lab Test">Lab Test (Test)</option>
                  <option value="Nursing / Bandage">Nursing / Bandage / Dressing</option>
                  <option value="Consultation">Consultation Fee</option>
                  <option value="Room / Bed">Room / Bed Charge</option>
                  <option value="Equipment / Consumable">Equipment / Consumable</option>
                  <option value="Other">Other Expense</option>
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-bold mb-1">Item Name / Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Bandage & Dressing, Paracetamol, CBC Test"
                  value={addItemName}
                  onChange={(e) => setAddItemName(e.target.value)}
                  className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-xl p-2.5 text-[13px] font-bold text-[var(--text-color)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-bold mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={addItemQty}
                    onChange={(e) => setAddItemQty(e.target.value)}
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-xl p-2.5 text-[13px] font-bold text-[var(--text-color)]"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-bold mb-1">Unit Price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    placeholder="150"
                    value={addItemPrice}
                    onChange={(e) => setAddItemPrice(e.target.value)}
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-xl p-2.5 text-[13px] font-bold text-[var(--text-color)]"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-[var(--border-color)]/30">
                <button
                  type="button"
                  onClick={() => setShowAddItemModal(false)}
                  className="px-4 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] text-[13px] font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold text-[13px] rounded-xl shadow-sm"
                >
                  Add to Bill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Discharge Patient & Pay Modal */}
      {showDischargeModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/40 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-fade-in relative text-[var(--text-color)] text-left">
            <h3 className="font-extrabold text-base mb-2 flex items-center space-x-2 border-b border-[var(--border-color)]/30 pb-2 text-emerald-600">
              <span className="material-symbols-outlined text-[24px]">task_alt</span>
              <span>Discharge</span>
            </h3>

            {dischargeError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-500 text-[13px] rounded-xl font-bold">
                {dischargeError}
              </div>
            )}
            {dischargeSuccess && (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-[13px] rounded-xl font-bold">
                {dischargeSuccess}
              </div>
            )}

            <div className="bg-[var(--bg-color)] p-3 rounded-xl border border-[var(--border-color)]/40 mb-4 text-[13px] font-bold space-y-1">
              <p className="text-[var(--text-color)]">Patient: {selectedInvoice.patient?.name}</p>
              <p className="text-[var(--text-secondary)]">
                Total Bill Amount: ₹{selectedInvoice.totalAmount}
              </p>
            </div>

            <form onSubmit={handleDischargePatient} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-bold mb-1">Discount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={dischargeDiscount}
                    onChange={(e) => setDischargeDiscount(e.target.value)}
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-xl p-2.5 text-[13px] font-bold text-[var(--text-color)]"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-bold mb-1">Amount Collecting (₹)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={dischargeAmountPaid}
                    onChange={(e) => setDischargeAmountPaid(e.target.value)}
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-xl p-2.5 text-[13px] font-bold text-[var(--text-color)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-bold mb-1">Payment Method</label>
                <select
                  value={dischargeMethod}
                  onChange={(e) => setDischargeMethod(e.target.value)}
                  className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-xl p-2.5 text-[13px] font-bold text-[var(--text-color)]"
                >
                  <option value="Cash">Cash Counter</option>
                  <option value="UPI">UPI / QR Code</option>
                  <option value="Card">Debit / Credit Card</option>
                  <option value="Net Banking">Net Banking</option>
                  <option value="Insurance">Health Insurance</option>
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-bold mb-1">Discharge Notes / Remarks</label>
                <input
                  type="text"
                  placeholder="e.g., Patient fit for discharge, prescribed 5-day meds"
                  value={dischargeNotes}
                  onChange={(e) => setDischargeNotes(e.target.value)}
                  className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-xl p-2.5 text-[13px] font-bold text-[var(--text-color)]"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-[var(--border-color)]/30">
                <button
                  type="button"
                  onClick={() => setShowDischargeModal(false)}
                  className="px-4 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] text-[13px] font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[13px] rounded-xl shadow-md flex items-center space-x-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  <span>Confirm discharge</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Digital Discharge Summary & Invoice Receipt Modal */}
      {showReceiptModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white text-zinc-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-fade-in relative text-left max-h-[90vh] overflow-y-auto">
            {/* Letterhead — the facility that actually treated the patient */}
            <div className="text-center border-b pb-4 mb-4">
              <h2 className="text-xl font-extrabold tracking-tight text-teal-700 uppercase">
                {billingConfig?.displayName || selectedInvoice.hospital || 'Hospital'}
              </h2>
              {billingConfig?.address && (
                <p className="text-[12px] text-zinc-500 font-medium">{billingConfig.address}</p>
              )}
              <p className="text-[12px] text-zinc-500 font-medium">
                {billingConfig?.phone ? `Ph: ${billingConfig.phone}` : ''}
                {billingConfig?.gstin ? `  |  GSTIN: ${billingConfig.gstin}` : ''}
              </p>
              <p className="text-[12px] text-zinc-500 font-bold uppercase tracking-wider mt-1">
                Official Discharge Summary & Invoice Receipt
              </p>
              <p className="text-[12px] text-zinc-400">Date: {new Date().toLocaleString()}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[13px] mb-4 p-3 bg-zinc-50 rounded-xl border border-zinc-200 font-medium">
              <div>
                <p className="text-[12px] text-zinc-400 font-bold uppercase">Invoice No:</p>
                <p className="font-extrabold text-teal-800">{selectedInvoice.invoiceNumber}</p>
              </div>
              <div>
                <p className="text-[12px] text-zinc-400 font-bold uppercase">Patient Name:</p>
                <p className="font-extrabold">{selectedInvoice.patient?.name}</p>
              </div>
              <div>
                <p className="text-[12px] text-zinc-400 font-bold uppercase">Phone:</p>
                <p>{selectedInvoice.patient?.phone}</p>
              </div>
              <div>
                <p className="text-[12px] text-zinc-400 font-bold uppercase">Discharged By:</p>
                <p>{selectedInvoice.dischargedBy || 'Reception'}</p>
              </div>
            </div>

            {/* Itemized Table */}
            <div className="mb-4">
              <h4 className="text-[12px] font-extrabold uppercase text-zinc-400 mb-2">Itemized Breakdown</h4>
              <table className="w-full text-left text-[13px] border-collapse">
                <thead>
                  <tr className="border-b text-zinc-500 font-bold text-[12px] uppercase">
                    <th className="py-2">Item</th>
                    <th className="py-2 text-center">Qty</th>
                    <th className="py-2 text-right">Price</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 font-medium text-[13px]">
                  {(selectedInvoice.items || []).map((it, idx) => (
                    <tr key={idx}>
                      <td className="py-2">
                        <span className="text-[11px] uppercase text-zinc-400 font-bold block">
                          {it.category}
                        </span>
                        {it.itemName}
                      </td>
                      <td className="py-2 text-center">{it.quantity}</td>
                      <td className="py-2 text-right">
                        {currency}
                        {it.unitPrice}
                      </td>
                      <td className="py-2 text-right font-bold">
                        {currency}
                        {it.totalPrice}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary Box */}
            <div className="border-t pt-3 space-y-1 text-[13px] text-right font-bold">
              <div className="flex justify-between text-zinc-500">
                <span>Subtotal:</span>
                <span>
                  {currency}
                  {selectedInvoice.subtotal}
                </span>
              </div>
              {selectedInvoice.discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount:</span>
                  <span>
                    -{currency}
                    {selectedInvoice.discount}
                  </span>
                </div>
              )}
              {selectedInvoice.tax > 0 && (
                <div className="flex justify-between text-zinc-500">
                  <span>Tax ({billingConfig?.taxPercent || 0}%):</span>
                  <span>
                    {currency}
                    {selectedInvoice.tax}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-base font-extrabold text-teal-800 pt-1 border-t">
                <span>Total Bill Amount:</span>
                <span>
                  {currency}
                  {selectedInvoice.totalAmount}
                </span>
              </div>
              <div className="flex justify-between text-[13px] text-zinc-600 pt-1">
                <span>Paid ({selectedInvoice.paymentMethod}):</span>
                <span className="text-emerald-600">
                  {currency}
                  {selectedInvoice.amountPaid}
                </span>
              </div>
              {selectedInvoice.balanceDue > 0 && (
                <div className="flex justify-between text-[13px] text-amber-600">
                  <span>Balance Due:</span>
                  <span>
                    {currency}
                    {selectedInvoice.balanceDue}
                  </span>
                </div>
              )}
              {selectedInvoice.notes && (
                <p className="text-[12px] text-zinc-500 font-medium text-left pt-2 border-t mt-2">
                  Remarks: {selectedInvoice.notes}
                </p>
              )}
              <p className="text-[12px] text-zinc-400 font-medium text-center pt-3">
                {billingConfig?.footerNote || 'Thank you. Get well soon!'}
              </p>
            </div>

            {/* Footer Buttons */}
            <div className="flex justify-between items-center pt-6 border-t mt-4">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-zinc-800 text-white rounded-xl text-[13px] font-bold hover:bg-zinc-700 flex items-center space-x-1"
              >
                <span className="material-symbols-outlined text-[16px]">print</span>
                <span>Print Receipt</span>
              </button>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="px-5 py-2 bg-teal-600 text-white rounded-xl text-[13px] font-bold hover:bg-teal-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Open a Bill for Any Patient (registered or walk-in) */}
      {showNewBillModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/40 rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-fade-in relative text-[var(--text-color)] text-left max-h-[90vh] overflow-y-auto">
            <h3 className="font-extrabold text-base mb-1 flex items-center space-x-2 text-emerald-600">
              <span className="material-symbols-outlined text-[22px]">receipt_long</span>
              <span>Open a New Bill</span>
            </h3>
            <p className="text-[13px] text-[var(--text-secondary)] font-medium mb-4 pb-3 border-b border-[var(--border-color)]/30">
              For any patient — someone already on file, or a walk-in who only needs a dressing, an injection
              or a test and has no token.
            </p>

            {newBillError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-500 text-[13px] rounded-xl font-bold">
                {newBillError}
              </div>
            )}

            <div className="flex gap-2 mb-4 text-[13px] font-bold">
              {[
                { id: 'existing', label: 'Existing Patient' },
                { id: 'new', label: 'New Walk-in' }
              ].map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setNewBillMode(mode.id)}
                  className={`flex-1 py-2 rounded-xl border transition-all ${
                    newBillMode === mode.id
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-[var(--bg-color)] border-[var(--border-color)] text-[var(--text-secondary)]'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleCreateInvoice} className="space-y-4 text-[13px]">
              {newBillMode === 'existing' ? (
                <div className="space-y-2">
                  <label className="block font-bold">Find Patient</label>
                  <input
                    type="text"
                    placeholder="Search by name or phone..."
                    value={newBillSearch}
                    onChange={(e) => setNewBillSearch(e.target.value)}
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-xl p-2.5 font-bold text-[var(--text-color)]"
                  />
                  <div className="max-h-48 overflow-y-auto border border-[var(--border-color)]/40 rounded-xl divide-y divide-[var(--border-color)]/20">
                    {patients
                      .filter((p) => {
                        const q = newBillSearch.toLowerCase();
                        if (!q) return true;
                        return (p.name || '').toLowerCase().includes(q) || (p.phone || '').includes(q);
                      })
                      .slice(0, 40)
                      .map((p) => (
                        <button
                          key={p._id}
                          type="button"
                          onClick={() => setNewBillPatientId(p._id)}
                          className={`w-full text-left p-2.5 transition-colors ${
                            newBillPatientId === p._id
                              ? 'bg-emerald-500/10 text-emerald-600'
                              : 'hover:bg-[var(--bg-color)]'
                          }`}
                        >
                          <span className="font-extrabold">{p.name}</span>
                          <span className="text-[12px] text-[var(--text-secondary)] block">
                            {p.phone} • {p.age}y • {p.gender}
                          </span>
                        </button>
                      ))}
                    {patients.length === 0 && (
                      <p className="p-4 text-center text-[var(--text-secondary)] italic">
                        No patients registered yet.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block font-bold mb-1">Patient Name</label>
                    <input
                      type="text"
                      required
                      value={newBillName}
                      onChange={(e) => setNewBillName(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-xl p-2.5 font-bold text-[var(--text-color)]"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">Phone Number</label>
                    <input
                      type="text"
                      required
                      placeholder="+91..."
                      value={newBillPhone}
                      onChange={(e) => setNewBillPhone(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-xl p-2.5 font-bold text-[var(--text-color)]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold mb-1">Age</label>
                      <input
                        type="number"
                        min="1"
                        max="130"
                        required
                        value={newBillAge}
                        onChange={(e) => setNewBillAge(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-xl p-2.5 font-bold text-[var(--text-color)]"
                      />
                    </div>
                    <div>
                      <label className="block font-bold mb-1">Gender</label>
                      <select
                        value={newBillGender}
                        onChange={(e) => setNewBillGender(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-xl p-2.5 font-bold text-[var(--text-color)]"
                      >
                        <option>Male</option>
                        <option>Female</option>
                        <option>Other</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={newBillConsult}
                  onChange={(e) => setNewBillConsult(e.target.checked)}
                  className="accent-emerald-600 w-4 h-4"
                />
                <span>
                  Start with the consultation fee ({currency}
                  {billingConfig?.consultationFee ?? 0})
                </span>
              </label>

              <div className="flex justify-end space-x-3 pt-4 border-t border-[var(--border-color)]/30">
                <button
                  type="button"
                  onClick={() => setShowNewBillModal(false)}
                  className="px-4 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md"
                >
                  Open Bill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 9. Facility Rate Card — this hospital's own billing environment */}
      {showRateCardModal && rateForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/40 rounded-2xl max-w-2xl w-full p-6 shadow-2xl animate-fade-in relative text-[var(--text-color)] text-left max-h-[90vh] overflow-y-auto">
            <h3 className="font-extrabold text-base mb-1 flex items-center space-x-2 text-teal-600">
              <span className="material-symbols-outlined text-[22px]">price_change</span>
              <span>Rate Card — {billingConfig?.displayName || staffUser?.hospital}</span>
            </h3>
            <p className="text-[13px] text-[var(--text-secondary)] font-medium mb-4 pb-3 border-b border-[var(--border-color)]/30">
              These prices, tax and letterhead apply to this hospital only. Other facilities on the platform
              keep their own.
            </p>

            {rateError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-500 text-[13px] rounded-xl font-bold">
                {rateError}
              </div>
            )}
            {rateSuccess && (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-[13px] rounded-xl font-bold">
                {rateSuccess}
              </div>
            )}

            <form onSubmit={handleSaveRateCard} className="space-y-4 text-[13px]">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { key: 'consultationFee', label: 'Doctor Consultation Fee' },
                  { key: 'labTestPrice', label: 'Lab Test (Routine)' },
                  { key: 'urgentLabTestPrice', label: 'Lab Test (Urgent)' },
                  { key: 'defaultMedicinePrice', label: 'Default Medicine Price' },
                  { key: 'registrationFee', label: 'Registration / File Fee' },
                  { key: 'taxPercent', label: 'Tax on Bill (%)' }
                ].map((field) => (
                  <div key={field.key}>
                    <label className="block font-bold mb-1">{field.label}</label>
                    <input
                      type="number"
                      min="0"
                      value={rateForm[field.key] ?? 0}
                      onChange={(e) => setRateForm({ ...rateForm, [field.key]: e.target.value })}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-xl p-2.5 font-bold text-[var(--text-color)]"
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { key: 'displayName', label: 'Name on Invoice' },
                  { key: 'phone', label: 'Contact Phone' },
                  { key: 'address', label: 'Address on Invoice' },
                  { key: 'gstin', label: 'GSTIN / Tax ID' },
                  { key: 'footerNote', label: 'Invoice Footer Note' },
                  { key: 'invoicePrefix', label: 'Invoice Number Prefix' }
                ].map((field) => (
                  <div key={field.key}>
                    <label className="block font-bold mb-1">{field.label}</label>
                    <input
                      type="text"
                      value={rateForm[field.key] || ''}
                      onChange={(e) => setRateForm({ ...rateForm, [field.key]: e.target.value })}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-xl p-2.5 font-bold text-[var(--text-color)]"
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl shadow-md"
                >
                  Save Rates
                </button>
              </div>
            </form>

            {/* Service catalogue */}
            <div className="mt-6 pt-4 border-t border-[var(--border-color)]/30 space-y-3">
              <h4 className="text-[13px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                Chargeable Services ({(billingConfig?.services || []).length})
              </h4>

              <div className="max-h-56 overflow-y-auto border border-[var(--border-color)]/40 rounded-xl divide-y divide-[var(--border-color)]/20 text-[13px]">
                {(billingConfig?.services || []).map((svc) => (
                  <div key={svc._id || svc.name} className="flex items-center justify-between p-2.5 gap-2">
                    <div className="min-w-0">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[11px] font-black uppercase ${CATEGORY_CHIP[svc.category] || CATEGORY_CHIP.Other}`}
                      >
                        {svc.category}
                      </span>
                      <span className="font-bold block truncate">{svc.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-extrabold text-teal-600">
                        {currency}
                        {svc.price}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteService(svc._id)}
                        className="text-rose-500 hover:bg-rose-500/10 p-1 rounded"
                        title="Remove from rate card"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddService} className="flex flex-col sm:flex-row gap-2 text-[13px]">
                <select
                  value={newSvcCategory}
                  onChange={(e) => setNewSvcCategory(e.target.value)}
                  className="bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-xl p-2.5 font-bold text-[var(--text-color)]"
                >
                  {BILLING_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  required
                  placeholder="Service name (e.g. Plaster / POD Cast)"
                  value={newSvcName}
                  onChange={(e) => setNewSvcName(e.target.value)}
                  className="flex-1 bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-xl p-2.5 font-bold text-[var(--text-color)]"
                />
                <input
                  type="number"
                  min="0"
                  required
                  placeholder="Price"
                  value={newSvcPrice}
                  onChange={(e) => setNewSvcPrice(e.target.value)}
                  className="sm:w-28 bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-xl p-2.5 font-bold text-[var(--text-color)]"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl"
                >
                  Add
                </button>
              </form>
            </div>

            <div className="flex justify-end pt-4 mt-4 border-t border-[var(--border-color)]/30">
              <button
                type="button"
                onClick={() => setShowRateCardModal(false)}
                className="px-5 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] text-[13px] font-bold rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
