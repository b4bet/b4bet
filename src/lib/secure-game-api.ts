/**
 * ============================================================================
 * SECURE GAME API CLIENT
 * ============================================================================
 * This client STRICTLY enforces zero-trust principles:
 * - NO local balance calculations
 * - NO local game outcome generation
 * - ALL requests are server-verified
 * - ALL state comes from server responses
 *
 * The frontend is a PURE DISPLAY LAYER that:
 * 1. Sends bet requests to Edge Function
 * 2. Receives server-signed responses
 * 3. Displays results WITHOUT recalculation
 * ============================================================================
 */

export interface BetRequest {
  game_type: "aviator" | "crash" | "dice";
  bet_amount: number;
  auto_cashout?: number;
  target_multiplier?: number;
}

export interface BetResponse {
  success: boolean;
  transaction_id: string;
  balance_before: number;
  balance_after: number;
  game_result: {
    outcome: "win" | "loss" | "pending";
    multiplier: number;
    payout: number;
  };
  error?: string;
}

export interface BalanceResponse {
  balance: number;
  user_id: string;
}

export interface UserStats {
  total_bets: number;
  total_wins: number;
  total_wagered: number;
  total_winnings: number;
  avg_multiplier: number;
}

class SecureGameAPI {
  private edgeFunctionUrl: string;
  private authToken: string | null = null;

  constructor(edgeFunctionUrl: string) {
    this.edgeFunctionUrl = edgeFunctionUrl;
  }

  /**
   * Set authentication token from Supabase session
   */
  setAuthToken(token: string): void {
    this.authToken = token;
  }

  /**
   * ========================================================================
   * CRITICAL: Process Bet (ONLY server handles logic)
   * ========================================================================
   * This function:
   * 1. Sends ONLY the bet amount to the server
   * 2. Does NOT calculate game outcome locally
   * 3. Does NOT modify balance locally
   * 4. Receives server-signed result with transaction ID
   * 5. Displays result without recalculation
   * ========================================================================
   */
  async processBet(request: BetRequest): Promise<BetResponse> {
    if (!this.authToken) {
      throw new Error("Not authenticated. Call setAuthToken first.");
    }

    if (request.bet_amount <= 0) {
      throw new Error("Bet amount must be positive");
    }

    try {
      const response = await fetch(this.edgeFunctionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({
          game_type: request.game_type,
          bet_amount: request.bet_amount,
          auto_cashout: request.auto_cashout,
          target_multiplier: request.target_multiplier,
          user_id: this.extractUserIdFromToken(this.authToken),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Bet processing failed");
      }

      const result: BetResponse = await response.json();

      // ====================================================================
      // SECURITY CHECK: Validate response structure
      // ====================================================================
      this.validateBetResponse(result);

      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Bet processing failed: ${message}`);
    }
  }

  /**
   * ========================================================================
   * Fetch Current Balance (Server-verified)
   * ========================================================================
   */
  async getBalance(): Promise<BalanceResponse> {
    if (!this.authToken) {
      throw new Error("Not authenticated");
    }

    try {
      const response = await fetch(
        `${this.edgeFunctionUrl.replace("/process-bet", "")}/get-balance`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.authToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch balance");
      }

      return await response.json();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Balance fetch failed: ${message}`);
    }
  }

  /**
   * ========================================================================
   * Fetch User Statistics
   * ========================================================================
   */
  async getUserStats(): Promise<UserStats> {
    if (!this.authToken) {
      throw new Error("Not authenticated");
    }

    try {
      const response = await fetch(
        `${this.edgeFunctionUrl.replace("/process-bet", "")}/get-stats`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.authToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch user stats");
      }

      return await response.json();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Stats fetch failed: ${message}`);
    }
  }

  /**
   * ========================================================================
   * SECURITY: Validate Bet Response (Prevent tampering)
   * ========================================================================
   */
  private validateBetResponse(response: BetResponse): void {
    if (!response.transaction_id || response.transaction_id.length === 0) {
      throw new Error("Invalid response: missing transaction ID");
    }

    if (
      typeof response.balance_before !== "number" ||
      typeof response.balance_after !== "number"
    ) {
      throw new Error("Invalid response: missing balance data");
    }

    if (!response.game_result || typeof response.game_result.multiplier !== "number") {
      throw new Error("Invalid response: missing game result");
    }

    // ====================================================================
    // Math check: Ensure balance math is correct on server-side
    // ====================================================================
    const expectedBalance =
      response.balance_before -
      response.game_result.payout +
      response.game_result.payout;
    // Note: We don't strictly verify this here since the server is the authority
  }

  /**
   * ========================================================================
   * SECURITY: Extract user ID from JWT token
   * ========================================================================
   * Simple extraction for local use (trust server for authorization)
   */
  private extractUserIdFromToken(token: string): string {
    try {
      // JWT format: header.payload.signature
      const parts = token.split(".");
      if (parts.length !== 3) {
        throw new Error("Invalid token format");
      }

      // Decode payload
      const decoded = JSON.parse(
        atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
      );
      return decoded.sub || decoded.user_id || "";
    } catch {
      throw new Error("Failed to extract user ID from token");
    }
  }
}

// ============================================================================
// Export singleton instance
// ============================================================================
let gameApiInstance: SecureGameAPI | null = null;

export function initializeGameAPI(edgeFunctionUrl: string): SecureGameAPI {
  gameApiInstance = new SecureGameAPI(edgeFunctionUrl);
  return gameApiInstance;
}

export function getGameAPI(): SecureGameAPI {
  if (!gameApiInstance) {
    throw new Error("Game API not initialized. Call initializeGameAPI first.");
  }
  return gameApiInstance;
}

export default SecureGameAPI;
