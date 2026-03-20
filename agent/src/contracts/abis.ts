// Auto-generated from Foundry compiled contract ABIs.
// Source: contracts/out/*/

export const PREDICTION_MARKET_ABI = [
  // Constructor
  { type: 'constructor', inputs: [{ name: 'usdc_', type: 'address' }, { name: 'trustScorer_', type: 'address' }, { name: 'agentRegistry_', type: 'address' }], stateMutability: 'nonpayable' },

  // Read functions
  { type: 'function', name: 'AGENT_REGISTRY', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'MAX_INSURANCE_MULTIPLIER', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'MIN_STAKE', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'PROTOCOL_FEE_BPS', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'TRUST_SCORER', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'USDC', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'predictionCount', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'predictions', inputs: [{ name: '', type: 'uint256' }], outputs: [{ name: 'agent', type: 'address' }, { name: 'predictionHash', type: 'bytes32' }, { name: 'stakeAmount', type: 'uint256' }, { name: 'expiresAt', type: 'uint256' }, { name: 'insurancePool', type: 'uint256' }, { name: 'premiumsCollected', type: 'uint256' }, { name: 'status', type: 'uint8' }, { name: 'stakeClaimed', type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'insurancePositions', inputs: [{ name: '', type: 'uint256' }, { name: '', type: 'address' }], outputs: [{ name: 'amount', type: 'uint256' }, { name: 'premiumPaid', type: 'uint256' }, { name: 'claimed', type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'calculatePremium', inputs: [{ name: 'predictionId', type: 'uint256' }, { name: 'insuranceAmount', type: 'uint256' }], outputs: [{ name: 'premium', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getInsuranceBuyers', inputs: [{ name: 'predictionId', type: 'uint256' }], outputs: [{ name: '', type: 'address[]' }], stateMutability: 'view' },
  { type: 'function', name: 'protocolFees', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'owner', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'paused', inputs: [], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },

  // Write functions
  { type: 'function', name: 'createPrediction', inputs: [{ name: 'predictionHash', type: 'bytes32' }, { name: 'stakeAmount', type: 'uint256' }, { name: 'expiresAt', type: 'uint256' }], outputs: [{ name: 'predictionId', type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'buyInsurance', inputs: [{ name: 'predictionId', type: 'uint256' }, { name: 'insuranceAmount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'resolvePrediction', inputs: [{ name: 'predictionId', type: 'uint256' }, { name: 'correct', type: 'bool' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'claimStake', inputs: [{ name: 'predictionId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'claimInsurance', inputs: [{ name: 'predictionId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'claimExpiredStake', inputs: [{ name: 'predictionId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'expirePrediction', inputs: [{ name: 'predictionId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'pause', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'unpause', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'withdrawFees', inputs: [{ name: 'to', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'renounceOwnership', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'transferOwnership', inputs: [{ name: 'newOwner', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },

  // Events
  { type: 'event', name: 'PredictionCreated', inputs: [{ name: 'predictionId', type: 'uint256', indexed: true }, { name: 'agent', type: 'address', indexed: true }, { name: 'predictionHash', type: 'bytes32', indexed: false }, { name: 'stakeAmount', type: 'uint256', indexed: false }, { name: 'expiresAt', type: 'uint256', indexed: false }], anonymous: false },
  { type: 'event', name: 'PredictionResolved', inputs: [{ name: 'predictionId', type: 'uint256', indexed: true }, { name: 'agent', type: 'address', indexed: true }, { name: 'correct', type: 'bool', indexed: false }, { name: 'status', type: 'uint8', indexed: false }], anonymous: false },
  { type: 'event', name: 'PredictionExpired', inputs: [{ name: 'predictionId', type: 'uint256', indexed: true }], anonymous: false },
  { type: 'event', name: 'InsurancePurchased', inputs: [{ name: 'predictionId', type: 'uint256', indexed: true }, { name: 'buyer', type: 'address', indexed: true }, { name: 'insuranceAmount', type: 'uint256', indexed: false }, { name: 'premiumPaid', type: 'uint256', indexed: false }], anonymous: false },
  { type: 'event', name: 'InsuranceClaimed', inputs: [{ name: 'predictionId', type: 'uint256', indexed: true }, { name: 'buyer', type: 'address', indexed: true }, { name: 'payout', type: 'uint256', indexed: false }], anonymous: false },
  { type: 'event', name: 'StakeClaimed', inputs: [{ name: 'predictionId', type: 'uint256', indexed: true }, { name: 'agent', type: 'address', indexed: true }, { name: 'payout', type: 'uint256', indexed: false }], anonymous: false },
  { type: 'event', name: 'OwnershipTransferred', inputs: [{ name: 'previousOwner', type: 'address', indexed: true }, { name: 'newOwner', type: 'address', indexed: true }], anonymous: false },
  { type: 'event', name: 'Paused', inputs: [{ name: 'account', type: 'address', indexed: false }], anonymous: false },
  { type: 'event', name: 'Unpaused', inputs: [{ name: 'account', type: 'address', indexed: false }], anonymous: false },

  // Errors
  { type: 'error', name: 'AlreadyClaimed', inputs: [] },
  { type: 'error', name: 'CannotInsureOwnPrediction', inputs: [] },
  { type: 'error', name: 'EnforcedPause', inputs: [] },
  { type: 'error', name: 'ExpectedPause', inputs: [] },
  { type: 'error', name: 'ExpiryTooSoon', inputs: [{ name: 'expiresAt', type: 'uint256' }, { name: 'minimum', type: 'uint256' }] },
  { type: 'error', name: 'InsuranceExceedsMax', inputs: [{ name: 'requested', type: 'uint256' }, { name: 'maximum', type: 'uint256' }] },
  { type: 'error', name: 'NoInsurancePosition', inputs: [] },
  { type: 'error', name: 'NotExpired', inputs: [{ name: 'predictionId', type: 'uint256' }] },
  { type: 'error', name: 'NotPredictionAgent', inputs: [{ name: 'caller', type: 'address' }, { name: 'agent', type: 'address' }] },
  { type: 'error', name: 'NotRegistered', inputs: [{ name: 'agent', type: 'address' }] },
  { type: 'error', name: 'OwnableInvalidOwner', inputs: [{ name: 'owner', type: 'address' }] },
  { type: 'error', name: 'OwnableUnauthorizedAccount', inputs: [{ name: 'account', type: 'address' }] },
  { type: 'error', name: 'PredictionNotActive', inputs: [{ name: 'predictionId', type: 'uint256' }] },
  { type: 'error', name: 'PredictionNotCorrect', inputs: [{ name: 'predictionId', type: 'uint256' }] },
  { type: 'error', name: 'PredictionNotResolved', inputs: [{ name: 'predictionId', type: 'uint256' }] },
  { type: 'error', name: 'PredictionNotWrong', inputs: [{ name: 'predictionId', type: 'uint256' }] },
  { type: 'error', name: 'ReentrancyGuardReentrantCall', inputs: [] },
  { type: 'error', name: 'SafeERC20FailedOperation', inputs: [{ name: 'token', type: 'address' }] },
  { type: 'error', name: 'StakeTooLow', inputs: [{ name: 'provided', type: 'uint256' }, { name: 'minimum', type: 'uint256' }] },
  { type: 'error', name: 'ZeroAmount', inputs: [] },
] as const;

export const TRUST_SCORER_ABI = [
  // Constructor
  { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },

  // Read functions
  { type: 'function', name: 'DEFAULT_SCORE', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'MAX_SCORE', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'MIN_PREDICTIONS', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getTrustScore', inputs: [{ name: 'agent', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'hasValidScore', inputs: [{ name: 'agent', type: 'address' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'scores', inputs: [{ name: '', type: 'address' }], outputs: [{ name: 'totalPredictions', type: 'uint256' }, { name: 'correctPredictions', type: 'uint256' }, { name: 'totalStaked', type: 'uint256' }, { name: 'totalInsurancePaid', type: 'uint256' }, { name: 'lastUpdated', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'predictionMarket', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'owner', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },

  // Write functions
  { type: 'function', name: 'setPredictionMarket', inputs: [{ name: 'market', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'updateScore', inputs: [{ name: 'agent', type: 'address' }, { name: 'correct', type: 'bool' }, { name: 'stakeAmount', type: 'uint256' }, { name: 'insuranceAmount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'renounceOwnership', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'transferOwnership', inputs: [{ name: 'newOwner', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },

  // Events
  { type: 'event', name: 'TrustScoreUpdated', inputs: [{ name: 'agent', type: 'address', indexed: true }, { name: 'newScore', type: 'uint256', indexed: false }, { name: 'totalPredictions', type: 'uint256', indexed: false }, { name: 'correctPredictions', type: 'uint256', indexed: false }], anonymous: false },
  { type: 'event', name: 'PredictionMarketSet', inputs: [{ name: 'market', type: 'address', indexed: true }], anonymous: false },
  { type: 'event', name: 'OwnershipTransferred', inputs: [{ name: 'previousOwner', type: 'address', indexed: true }, { name: 'newOwner', type: 'address', indexed: true }], anonymous: false },

  // Errors
  { type: 'error', name: 'OwnableInvalidOwner', inputs: [{ name: 'owner', type: 'address' }] },
  { type: 'error', name: 'OwnableUnauthorizedAccount', inputs: [{ name: 'account', type: 'address' }] },
  { type: 'error', name: 'Unauthorized', inputs: [] },
  { type: 'error', name: 'ZeroAddress', inputs: [] },
] as const;

export const AGENT_REGISTRY_ABI = [
  // Constructor
  { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },

  // Read functions
  { type: 'function', name: 'agentCount', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getAgent', inputs: [{ name: 'wallet', type: 'address' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'wallet', type: 'address' }, { name: 'erc8004Uri', type: 'string' }, { name: 'registeredAt', type: 'uint256' }, { name: 'active', type: 'bool' }] }], stateMutability: 'view' },
  { type: 'function', name: 'isRegistered', inputs: [{ name: 'wallet', type: 'address' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'owner', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },

  // Write functions
  { type: 'function', name: 'registerAgent', inputs: [{ name: 'erc8004Uri', type: 'string' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'deactivateAgent', inputs: [{ name: 'wallet', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'reactivateAgent', inputs: [{ name: 'wallet', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'renounceOwnership', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'transferOwnership', inputs: [{ name: 'newOwner', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },

  // Events
  { type: 'event', name: 'AgentRegistered', inputs: [{ name: 'wallet', type: 'address', indexed: true }, { name: 'erc8004Uri', type: 'string', indexed: false }, { name: 'registeredAt', type: 'uint256', indexed: false }], anonymous: false },
  { type: 'event', name: 'AgentDeactivated', inputs: [{ name: 'wallet', type: 'address', indexed: true }], anonymous: false },
  { type: 'event', name: 'AgentReactivated', inputs: [{ name: 'wallet', type: 'address', indexed: true }], anonymous: false },
  { type: 'event', name: 'OwnershipTransferred', inputs: [{ name: 'previousOwner', type: 'address', indexed: true }, { name: 'newOwner', type: 'address', indexed: true }], anonymous: false },

  // Errors
  { type: 'error', name: 'AlreadyRegistered', inputs: [{ name: 'wallet', type: 'address' }] },
  { type: 'error', name: 'EmptyUri', inputs: [] },
  { type: 'error', name: 'NotRegistered', inputs: [{ name: 'wallet', type: 'address' }] },
  { type: 'error', name: 'OwnableInvalidOwner', inputs: [{ name: 'owner', type: 'address' }] },
  { type: 'error', name: 'OwnableUnauthorizedAccount', inputs: [{ name: 'account', type: 'address' }] },
] as const;

export const ERC20_ABI = [
  // Constructor
  { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },

  // Read functions
  { type: 'function', name: 'name', inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ name: '', type: 'uint8' }], stateMutability: 'pure' },
  { type: 'function', name: 'totalSupply', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },

  // Write functions
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'transfer', inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'transferFrom', inputs: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'mint', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },

  // Events
  { type: 'event', name: 'Approval', inputs: [{ name: 'owner', type: 'address', indexed: true }, { name: 'spender', type: 'address', indexed: true }, { name: 'value', type: 'uint256', indexed: false }], anonymous: false },
  { type: 'event', name: 'Transfer', inputs: [{ name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'value', type: 'uint256', indexed: false }], anonymous: false },

  // Errors
  { type: 'error', name: 'ERC20InsufficientAllowance', inputs: [{ name: 'spender', type: 'address' }, { name: 'allowance', type: 'uint256' }, { name: 'needed', type: 'uint256' }] },
  { type: 'error', name: 'ERC20InsufficientBalance', inputs: [{ name: 'sender', type: 'address' }, { name: 'balance', type: 'uint256' }, { name: 'needed', type: 'uint256' }] },
  { type: 'error', name: 'ERC20InvalidApprover', inputs: [{ name: 'approver', type: 'address' }] },
  { type: 'error', name: 'ERC20InvalidReceiver', inputs: [{ name: 'receiver', type: 'address' }] },
  { type: 'error', name: 'ERC20InvalidSender', inputs: [{ name: 'sender', type: 'address' }] },
  { type: 'error', name: 'ERC20InvalidSpender', inputs: [{ name: 'spender', type: 'address' }] },
] as const;
