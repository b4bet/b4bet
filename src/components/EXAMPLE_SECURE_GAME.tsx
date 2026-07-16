/**
 * ============================================================================
 * EXAMPLE: Secure Game Component (ZERO-TRUST PATTERN)
 * ============================================================================
 * This component demonstrates the correct pattern for:
 * 1. Sending bet requests to Edge Function
 * 2. Receiving server-verified results
 * 3. Displaying results WITHOUT recalculation
 * 4. Updating balance from server response
 *
 * Copy this pattern to all your game components!
 * ============================================================================
 */

import { useState, useEffect } from "react";
import { getGameAPI } from "@/lib/secure-game-api";
import type { BetResponse } from "@/lib/secure-game-api";

export function ExampleSecureGame() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [betAmount, setBetAmount] = useState<number>(100);
  const [lastResult, setLastResult] = useState<BetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // =========================================================================
  // STEP 1: Load balance from server (NOT from localStorage or state init)
  // =========================================================================
  useEffect(() => {
    const loadBalance = async () => {
      try {
        const gameAPI = getGameAPI();
        const balanceData = await gameAPI.getBalance();
        setCurrentBalance(balanceData.balance);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
      }
    };

    loadBalance();
  }, []);

  // =========================================================================
  // STEP 2: Handle bet submission (NO local logic)
  // =========================================================================
  const handlePlaceBet = async () => {
    if (betAmount <= 0 || betAmount > currentBalance) {
      setError("Invalid bet amount");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const gameAPI = getGameAPI();

      // =====================================================================
      // CRITICAL: Send ONLY the bet amount to server
      // =====================================================================
      const response = await gameAPI.processBet({
        game_type: "aviator",
        bet_amount: betAmount,
        auto_cashout: 2.5, // Server will enforce this
      });

      if (!response.success) {
        setError(response.error || "Bet failed");
        return;
      }

      // =====================================================================
      // IMPORTANT: Update balance from server response
      // =====================================================================
      setCurrentBalance(response.balance_after);
      setLastResult(response);

      // =====================================================================
      // Log transaction ID for reference (admin can verify later)
      // =====================================================================
      console.log(
        `[v0] Transaction ID: ${response.transaction_id} | Balance: ${response.balance_before} → ${response.balance_after}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  };

  // =========================================================================
  // RENDER: Display server-verified results
  // =========================================================================
  return (
    <div className="p-8 bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg">
      <h2 className="text-2xl font-bold text-white mb-6">
        Secure Game Example
      </h2>

      {/* Balance Display */}
      <div className="mb-6 p-4 bg-slate-700 rounded-lg">
        <p className="text-gray-300 text-sm mb-2">Current Balance</p>
        <p className="text-3xl font-bold text-emerald-400">
          ${currentBalance.toFixed(2)}
        </p>
      </div>

      {/* Bet Input */}
      <div className="mb-6">
        <label className="text-white text-sm font-medium mb-2 block">
          Bet Amount
        </label>
        <input
          type="number"
          value={betAmount}
          onChange={(e) => setBetAmount(Number(e.target.value))}
          disabled={isProcessing}
          className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-emerald-500 outline-none"
          min="1"
          max={currentBalance}
        />
      </div>

      {/* Quick Bet Buttons */}
      <div className="mb-6 flex gap-2 flex-wrap">
        {[50, 100, 250, 500].map((amount) => (
          <button
            key={amount}
            onClick={() => setBetAmount(amount)}
            disabled={isProcessing || amount > currentBalance}
            className="px-4 py-2 bg-slate-600 hover:bg-slate-500 disabled:bg-gray-600 text-white rounded-lg transition"
          >
            ${amount}
          </button>
        ))}
      </div>

      {/* Place Bet Button */}
      <button
        onClick={handlePlaceBet}
        disabled={isProcessing || betAmount <= 0 || betAmount > currentBalance}
        className={`w-full py-3 px-4 rounded-lg font-bold text-white transition ${
          isProcessing || betAmount <= 0 || betAmount > currentBalance
            ? "bg-gray-600 cursor-not-allowed"
            : "bg-emerald-600 hover:bg-emerald-500"
        }`}
      >
        {isProcessing ? "Processing..." : "Place Bet"}
      </button>

      {/* Error Display */}
      {error && (
        <div className="mt-6 p-4 bg-red-900 text-red-200 rounded-lg">
          <p className="font-semibold">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Result Display */}
      {lastResult && (
        <div
          className={`mt-6 p-6 rounded-lg ${
            lastResult.game_result.outcome === "win"
              ? "bg-emerald-900 text-emerald-200"
              : "bg-red-900 text-red-200"
          }`}
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold opacity-75">OUTCOME</p>
              <p className="text-2xl font-bold">
                {lastResult.game_result.outcome.toUpperCase()}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold opacity-75">MULTIPLIER</p>
              <p className="text-2xl font-bold">
                {lastResult.game_result.multiplier.toFixed(2)}x
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold opacity-75">PAYOUT</p>
              <p className="text-xl font-bold">
                ${lastResult.game_result.payout.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold opacity-75">TX ID</p>
              <p className="text-xs font-mono break-all">
                {lastResult.transaction_id.substring(0, 12)}...
              </p>
            </div>
          </div>

          {/* ================================================================
              SECURITY NOTE: Transaction ID proves this bet was processed
              by the server. Screenshot this for dispute resolution.
              ================================================================ */}
        </div>
      )}

      {/* Security Info */}
      <div className="mt-8 p-4 bg-blue-900 text-blue-200 rounded-lg text-sm">
        <p className="font-semibold mb-2">🔒 Security Features Active:</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>Balance verified server-side</li>
          <li>Game outcome generated with crypto.getRandomValues()</li>
          <li>All transactions logged with immutable transaction IDs</li>
          <li>RLS policies prevent unauthorized data access</li>
          <li>Atomic database operations prevent race conditions</li>
        </ul>
      </div>
    </div>
  );
}

export default ExampleSecureGame;
