import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { BACKEND_URL } from '../App';

export default function DigitalPrescriptionViewer() {
  const { tokenId } = useParams();
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPrescription = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/chat/token/${tokenId}`);
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
      } else {
        setError(data.message || 'Prescription details not found');
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrescription();
  }, [tokenId]);

  if (loading) {
    return (
      <div className="flex-grow flex items-center justify-center p-6 bg-[var(--bg-color)]">
        <div className="text-[var(--text-secondary)] font-bold text-sm">Retrieving prescription profile...</div>
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="flex-grow flex items-center justify-center p-6 bg-[var(--bg-color)]">
        <div className="text-rose-500 font-bold text-sm border border-rose-500/20 bg-rose-500/5 px-4 py-3 rounded-xl">{error || 'Prescription not found'}</div>
      </div>
    );
  }

  const { patient, doctor, prescription, labTests } = token;

  return (
    <div className="flex-grow bg-[var(--bg-color)] p-4 md:p-8 overflow-y-auto flex items-start justify-center text-left">
      <div className="w-full max-w-2xl bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-3xl p-6 md:p-8 shadow-[var(--card-shadow)] relative space-y-6 text-[var(--text-color)]" id="printable-prescription">
        
        {/* Prescription Invoice Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-[var(--border-color)]/30 gap-4">
          <div className="flex items-center space-x-2.5">
            <div className="bg-orange-600 p-2 rounded-xl text-white">
              <span className="material-symbols-outlined text-[24px]">clinical_notes</span>
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">
                {doctor?.hospital === 'pediatrics-clinic' ? 'St. Jude Pediatrics Clinic' : 'CareSync General Hospital'}
              </h2>
              <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider">Clinical Care & Diagnostics</p>
            </div>
          </div>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-[var(--bg-color)] hover:bg-[var(--border-color)]/30 border border-[var(--border-color)] text-[var(--text-color)] text-xs font-bold rounded-xl shadow-sm transition-all active:scale-95 duration-100 flex items-center space-x-1.5 print:hidden"
          >
            <span className="material-symbols-outlined text-[16px]">print</span>
            <span>Print / Save PDF</span>
          </button>
        </div>

        {/* Patient & Doctor metadata grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-[var(--bg-color)]/50 p-4 rounded-2xl border border-[var(--border-color)]/35 text-xs font-semibold">
          <div className="space-y-1.5">
            <span className="text-[10px] text-[var(--text-secondary)] uppercase font-extrabold tracking-wider">Patient Details</span>
            <p className="text-sm font-extrabold text-[var(--text-color)]">{patient?.name}</p>
            <p className="text-[var(--text-secondary)]">Age: {patient?.age} yrs | Gender: {patient?.gender}</p>
            <p className="text-[var(--text-secondary)]">Phone: {patient?.phone}</p>
          </div>
          <div className="space-y-1.5 sm:text-right">
            <span className="text-[10px] text-[var(--text-secondary)] uppercase font-extrabold tracking-wider">Consultant Details</span>
            <p className="text-sm font-extrabold text-[var(--text-color)]">{doctor?.name}</p>
            <p className="text-[var(--text-secondary)]">{doctor?.department} Department</p>
            <p className="text-[var(--text-secondary)]">Room: {doctor?.currentRoom || 'Cabin A'}</p>
          </div>
        </div>

        {/* Symptoms Section */}
        <div className="space-y-2">
          <h4 className="text-xs uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">Reported Symptoms</h4>
          <p className="text-sm font-medium leading-relaxed bg-[var(--bg-color)]/30 p-3.5 rounded-xl border border-[var(--border-color)]/30">{token.symptoms}</p>
        </div>

        {/* Prescription Table */}
        <div className="space-y-2">
          <h4 className="text-xs uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">Prescribed Medications</h4>
          {prescription && prescription.medicines && prescription.medicines.length > 0 ? (
            <div className="overflow-x-auto border border-[var(--border-color)]/30 rounded-xl">
              <table className="w-full text-left text-xs font-semibold border-collapse">
                <thead>
                  <tr className="bg-[var(--bg-color)]/50 border-b border-[var(--border-color)]/30 text-[var(--text-secondary)] uppercase font-bold text-[9px] tracking-wider">
                    <th className="p-3.5">Medicine Name</th>
                    <th className="p-3.5">Dosage</th>
                    <th className="p-3.5">Duration</th>
                    <th className="p-3.5">Instructions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]/20">
                  {prescription.medicines.map((med, idx) => (
                    <tr key={idx} className="hover:bg-[var(--border-color)]/5 transition-colors">
                      <td className="p-3.5 font-bold text-[var(--text-color)]">{med.name}</td>
                      <td className="p-3.5 font-bold text-[var(--text-color)]">{med.dosage}</td>
                      <td className="p-3.5 text-[var(--text-secondary)]">{med.duration}</td>
                      <td className="p-3.5 text-[var(--text-secondary)]">{med.instructions || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-[var(--text-secondary)]/50 italic py-2">No medications prescribed.</p>
          )}
        </div>

        {/* Lab Reports Section */}
        {labTests && labTests.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">Clinical Lab Diagnoses</h4>
            <div className="space-y-2">
              {labTests.map((test, idx) => (
                <div key={idx} className="bg-[var(--bg-color)]/30 p-3.5 rounded-xl border border-[var(--border-color)]/30 flex items-start justify-between text-xs gap-3">
                  <div className="flex items-center space-x-2">
                    <span className="material-symbols-outlined text-[18px] text-teal-650">science</span>
                    <div>
                      <span className="font-bold text-[var(--text-color)]">{test.testName}</span>
                      {test.status === 'Completed' && (
                        <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">Results: <span className="font-semibold text-[var(--text-color)]">{test.remarks}</span></p>
                      )}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wide shrink-0 ${
                    test.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                  }`}>
                    {test.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Doctor Advice / Footer */}
        {prescription && prescription.advice && (
          <div className="space-y-2 pt-2">
            <h4 className="text-xs uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">Doctor's Advice</h4>
            <p className="text-sm font-medium leading-relaxed italic bg-zinc-550/5 p-3.5 rounded-xl border border-[var(--border-color)]/20">{prescription.advice}</p>
          </div>
        )}

      </div>
    </div>
  );
}
