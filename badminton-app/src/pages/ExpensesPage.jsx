import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../services/supabaseClient';
import { Plus, Trash2, ArrowLeft, TrendingUp, TrendingDown, X } from 'lucide-react';

export default function ExpensesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isAdmin = !!user;
  
  const [expenses, setExpenses] = useState([]);
  const [funds, setFunds] = useState([]);
  const [totalPlayerFunds, setTotalPlayerFunds] = useState(0);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [showAddFundsModal, setShowAddFundsModal] = useState(false);
  const [expenseFormData, setExpenseFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'court',
    amount: '',
    description: ''
  });
  const [fundsFormData, setFundsFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    description: ''
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load expenses
      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('*')
        .order('date', { ascending: false });

      if (expensesError) throw expensesError;
      setExpenses(expensesData || []);

      // Load funds
      const { data: fundsData, error: fundsError } = await supabase
        .from('funds')
        .select('*')
        .order('date', { ascending: false });

      if (fundsError) throw fundsError;
      setFunds(fundsData || []);

      // Calculate total funds received from players
      const { data: transactions, error: transError } = await supabase
        .from('transactions')
        .select('amount')
        .eq('type', 'payment');

      if (transError) throw transError;
      
      const total = transactions.reduce((sum, t) => sum + t.amount, 0);
      setTotalPlayerFunds(total);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const addExpense = async () => {
    if (!expenseFormData.amount || parseFloat(expenseFormData.amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    try {
      const { error } = await supabase
        .from('expenses')
        .insert([{
          date: expenseFormData.date,
          type: expenseFormData.type,
          amount: parseFloat(expenseFormData.amount),
          description: expenseFormData.description
        }]);

      if (error) throw error;

      alert('Expense added!');
      setShowAddExpenseModal(false);
      setExpenseFormData({
        date: new Date().toISOString().split('T')[0],
        type: 'court',
        amount: '',
        description: ''
      });
      await loadData();
    } catch (error) {
      console.error('Error adding expense:', error);
      alert('Failed to add expense: ' + error.message);
    }
  };

  const addFunds = async () => {
    if (!fundsFormData.amount || parseFloat(fundsFormData.amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    try {
      const { error } = await supabase
        .from('funds')
        .insert([{
          date: fundsFormData.date,
          amount: parseFloat(fundsFormData.amount),
          description: fundsFormData.description
        }]);

      if (error) throw error;

      alert('Funds added!');
      setShowAddFundsModal(false);
      setFundsFormData({
        date: new Date().toISOString().split('T')[0],
        amount: '',
        description: ''
      });
      await loadData();
    } catch (error) {
      console.error('Error adding funds:', error);
      alert('Failed to add funds: ' + error.message);
    }
  };

  const deleteExpense = async (id) => {
    if (!window.confirm('Delete this expense?')) return;

    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      await loadData();
      alert('Expense deleted');
    } catch (error) {
      console.error('Error deleting expense:', error);
      alert('Failed to delete expense');
    }
  };

  const deleteFund = async (id) => {
    if (!window.confirm('Delete this fund entry?')) return;

    try {
      const { error } = await supabase
        .from('funds')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      await loadData();
      alert('Fund entry deleted');
    } catch (error) {
      console.error('Error deleting fund:', error);
      alert('Failed to delete fund');
    }
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalAdditionalFunds = funds.reduce((sum, f) => sum + f.amount, 0);
  const totalAllFunds = totalPlayerFunds + totalAdditionalFunds;
  const remainingBalance = totalAllFunds - totalExpenses;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🏸</div>
          <div className="text-xl text-indigo-900 font-semibold">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-3 pb-20">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <button
          onClick={() => navigate(isAdminRoute ? '/admin' : '/')}
          className="mb-4 flex items-center gap-2 text-indigo-600 font-semibold"
        >
          <ArrowLeft size={20} />
          Back to {isAdminRoute ? 'Dashboard' : 'Queue'}
        </button>

        <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
          <div className="flex justify-between items-center mb-2">
            <div>
              <h1 className="text-2xl font-bold text-indigo-900">📊 Treasury Manager</h1>
              <p className="text-sm text-indigo-700">
                {isAdmin ? 'Manage funds and expenses' : 'View treasury status'}
              </p>
            </div>
            {isAdmin && (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddFundsModal(true)}
                  className="bg-green-600 text-white px-4 py-2 rounded-xl font-semibold text-sm active:bg-green-700 flex items-center gap-2"
                >
                  <Plus size={16} />
                  Add Fund
                </button>
                <button
                  onClick={() => setShowAddExpenseModal(true)}
                  className="bg-red-600 text-white px-4 py-2 rounded-xl font-semibold text-sm active:bg-red-700 flex items-center gap-2"
                >
                  <Plus size={16} />
                  Expense
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Fund Summary */}
        <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
          <h2 className="text-lg font-bold mb-3">💰 Treasury Status</h2>
          <div className="space-y-3">
            <div className="flex justify-between p-3 bg-blue-50 rounded-xl border-2 border-blue-200">
              <div className="flex items-center gap-2">
                <span className="font-medium">Player Payments</span>
              </div>
              <span className="font-bold text-blue-600 text-lg">¥{totalPlayerFunds.toFixed(2)}</span>
            </div>

            <div className="flex justify-between p-3 bg-green-50 rounded-xl border-2 border-green-200">
              <div className="flex items-center gap-2">
                <span className="font-medium">Additional Funds</span>
              </div>
              <span className="font-bold text-green-600 text-lg">¥{totalAdditionalFunds.toFixed(2)}</span>
            </div>

            <div className="flex justify-between p-3 bg-emerald-50 rounded-xl border-2 border-emerald-300">
              <div className="flex items-center gap-2">
                <TrendingUp className="text-emerald-600" size={20} />
                <span className="font-medium">Total Funds</span>
              </div>
              <span className="font-bold text-emerald-600 text-lg">¥{totalAllFunds.toFixed(2)}</span>
            </div>

            <div className="flex justify-between p-3 bg-red-50 rounded-xl border-2 border-red-200">
              <div className="flex items-center gap-2">
                <TrendingDown className="text-red-600" size={20} />
                <span className="font-medium">Total Expenses</span>
              </div>
              <span className="font-bold text-red-600 text-lg">¥{totalExpenses.toFixed(2)}</span>
            </div>

            <div className={`flex justify-between p-4 rounded-xl border-2 ${
              remainingBalance >= 0 ? 'bg-blue-50 border-blue-300' : 'bg-orange-50 border-orange-300'
            }`}>
              <span className="font-bold text-lg">Remaining Balance</span>
              <span className={`font-bold text-2xl ${
                remainingBalance >= 0 ? 'text-blue-600' : 'text-orange-600'
              }`}>
                ¥{remainingBalance.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Additional Funds List */}
        <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
          <h2 className="text-lg font-bold mb-3">💵 Additional Funds ({funds.length})</h2>
          {funds.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No additional funds recorded yet
            </div>
          ) : (
            <div className="space-y-2">
              {funds.map(fund => (
                <div key={fund.id} className="p-4 bg-green-50 rounded-xl border border-green-200">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm text-gray-600">
                          {new Date(fund.date).toLocaleDateString()}
                        </span>
                      </div>
                      {fund.description && (
                        <div className="text-sm text-gray-600 mt-1">{fund.description}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <span className="font-bold text-lg text-green-600">
                        +¥{fund.amount.toFixed(2)}
                      </span>
                      {isAdmin && (
                        <button
                          onClick={() => deleteFund(fund.id)}
                          className="bg-red-100 text-red-700 p-2 rounded-lg active:bg-red-200"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Expenses List */}
        <div className="bg-white rounded-xl shadow-lg p-4">
          <h2 className="text-lg font-bold mb-3">💸 Expense History ({expenses.length})</h2>
          {expenses.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No expenses recorded yet
            </div>
          ) : (
            <div className="space-y-2">
              {expenses.map(expense => (
                <div key={expense.id} className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          expense.type === 'court' ? 'bg-blue-100 text-blue-700' :
                          expense.type === 'shuttlecock' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {expense.type === 'court' ? '🏟️ Court' :
                           expense.type === 'shuttlecock' ? '🏸 Shuttlecock' :
                           '📋 Other'}
                        </span>
                        <span className="text-sm text-gray-600">
                          {new Date(expense.date).toLocaleDateString()}
                        </span>
                      </div>
                      {expense.description && (
                        <div className="text-sm text-gray-600 mt-1">{expense.description}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <span className="font-bold text-lg text-red-600">
                        -¥{expense.amount.toFixed(2)}
                      </span>
                      {isAdmin && (
                        <button
                          onClick={() => deleteExpense(expense.id)}
                          className="bg-red-100 text-red-700 p-2 rounded-lg active:bg-red-200"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Funds Modal - Admin Only */}
      {isAdmin && showAddFundsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Add Fund Entry</h3>
              <button 
                onClick={() => setShowAddFundsModal(false)} 
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-2">Date</label>
                <input
                  type="date"
                  value={fundsFormData.date}
                  onChange={(e) => setFundsFormData({...fundsFormData, date: e.target.value})}
                  className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ fontSize: '16px' }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Amount (¥)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={fundsFormData.amount}
                  onChange={(e) => setFundsFormData({...fundsFormData, amount: e.target.value})}
                  placeholder="0.00"
                  className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ fontSize: '16px' }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <input
                  type="text"
                  value={fundsFormData.description}
                  onChange={(e) => setFundsFormData({...fundsFormData, description: e.target.value})}
                  placeholder="e.g., Initial balance from old spreadsheet"
                  className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ fontSize: '16px' }}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowAddFundsModal(false)}
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl font-semibold active:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={addFunds}
                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl font-semibold active:bg-green-700"
              >
                Add Fund
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Expense Modal - Admin Only */}
      {isAdmin && showAddExpenseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Add Expense</h3>
              <button 
                onClick={() => setShowAddExpenseModal(false)} 
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-2">Date</label>
                <input
                  type="date"
                  value={expenseFormData.date}
                  onChange={(e) => setExpenseFormData({...expenseFormData, date: e.target.value})}
                  className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  style={{ fontSize: '16px' }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Type</label>
                <select
                  value={expenseFormData.type}
                  onChange={(e) => setExpenseFormData({...expenseFormData, type: e.target.value})}
                  className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  style={{ fontSize: '16px' }}
                >
                  <option value="court">Court Reservation</option>
                  <option value="shuttlecock">Shuttlecock Purchase</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Amount (¥)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={expenseFormData.amount}
                  onChange={(e) => setExpenseFormData({...expenseFormData, amount: e.target.value})}
                  placeholder="0.00"
                  className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  style={{ fontSize: '16px' }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Description (Optional)</label>
                <input
                  type="text"
                  value={expenseFormData.description}
                  onChange={(e) => setExpenseFormData({...expenseFormData, description: e.target.value})}
                  placeholder="e.g., Reserved for June 1-4"
                  className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  style={{ fontSize: '16px' }}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowAddExpenseModal(false)}
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl font-semibold active:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={addExpense}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-semibold active:bg-red-700"
              >
                Add Expense
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}