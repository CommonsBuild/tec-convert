import React, { useMemo } from 'react'
import { formatUnits } from 'lib/web3-utils'
import { bigNum } from '../../lib/utils'

// TODO: Provide `digits` into formatUnits 
function Balance({ tokenAmountToConvert, tokenBalance, spendableBalance }) {
  const balanceError = useMemo(
    () =>
      tokenAmountToConvert.gt(spendableBalance) &&
      !tokenAmountToConvert.eq(-1) &&
      !tokenBalance.eq(-1),
    [tokenAmountToConvert, tokenBalance, spendableBalance]
  )

  return !tokenBalance.eq(-1) ? (
    <div
      css={`
        text-align: center;
        font-family: 'BaiJamjuree', 'Calibre', sans-serif;
        color: ${balanceError ? '#FF7163' : 'white'};
        background: ${balanceError
          ? 'rgba(255, 255, 255, 0.7)'
          : 'transparent'};
        padding: 0 12px 0 12px;
      `}
    >
      {balanceError ? 'Insufficient balance' : 'Balance'}:{' '}
      {formatUnits(spendableBalance || 0, { truncateToDecimalPlace: 3, replaceZeroBy: '0' })}<br/>
      {!spendableBalance.eq(tokenBalance) && `Locked: ${formatUnits(tokenBalance.sub(spendableBalance), { truncateToDecimalPlace: 3, replaceZeroBy: '0' })}`}
    </div>
  ) : null
}

export default Balance
