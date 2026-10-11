# Fundamentals of Quantum Computing: Core Syllabus

## Module 1: Classical Bits vs Quantum Qubits
Classical computing relies on deterministic bits that exist in a state of 0 or 1. Quantum computing uses qubits, which leverage physical phenomena from quantum mechanics. A qubit can exist in a linear combination of states |0⟩ and |1⟩, denoted mathematically as |ψ⟩ = α|0⟩ + β|1⟩, where α and β are complex probability amplitudes satisfying |α|² + |β|² = 1.

## Module 2: The Principle of Superposition
Superposition allows a quantum system to exist simultaneously in multiple basis states until measurement. When measured, the superposition collapses into one of the definite eigenstates with a probability determined by the amplitude squared. This allows quantum algorithms to process an exponentially vast computational state space in parallel.

## Module 3: Quantum Entanglement and Non-Locality
Entanglement is a physical phenomenon where two or more qubits become correlated such that the quantum state of each qubit cannot be described independently of the state of the others, regardless of spatial distance. For example, in a Bell state |Φ⁺⟩ = (|00⟩ + |11⟩)/√2, measuring one qubit immediately determines the outcome of the other qubit with 100% certainty.

## Module 4: Quantum Logic Gates and Reversibility
Unlike classical logic gates (such as irreversible NAND or AND gates), quantum operations are represented by unitary matrices (U†U = I) and are fundamentally reversible. Common single-qubit gates include the Pauli-X (quantum NOT gate), Pauli-Z (phase flip), and the Hadamard gate (H), which transforms standard basis states into equal superposition states.

## Module 5: Quantum Decoherence and Error Correction
Quantum states are fragile and susceptible to environmental noise, stray magnetic fields, and thermal fluctuations—a phenomenon termed decoherence. Because the No-Cloning Theorem forbids making identical copies of an unknown quantum state, classical duplication-based error correction is impossible. Quantum Error Correction (QEC) instead distributes quantum information across topological surface codes or entangled ancillary qubits.
