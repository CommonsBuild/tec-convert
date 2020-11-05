import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { useViewport } from 'use-viewport'

import bondedColor from './tec.svg'
import bondedWhite from './tec.svg'
import collateralColor from './xdai-color.svg'
import collateralWhite from './xdai-white.svg'

import { collateral, bonded } from '../../config'

function getImage(color, symbol) {
  if (symbol === collateral.symbol) {
    return color ? collateralColor : collateralWhite
  }
  if (symbol === bonded.symbol) {
    return color ? bondedColor : bondedWhite
  }
}

function AmountInput({
  color = true,
  disabled = false,
  onChange,
  symbol,
  value,
}) {
  const viewport = useViewport()

  // Super ugly Next.js workaround to let us have differences between SSR & client
  const [isCompact, setIsCompact] = useState(false)
  const smallLayout = viewport.below(414)
  useEffect(() => {
    setTimeout(() => {
      setIsCompact(smallLayout)
    }, 0)
  }, [smallLayout])

  return (
    <label
      css={`
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        margin: 0;
        height: 100%;
      `}
    >
      <div
        css={`
          display: flex;
          align-items: center;
          font-size: 24px;
          color: ${color ? '#9096B6' : '#FFF'};
        `}
      >
        <img
          src={getImage(color, symbol)}
          alt=""
          css={`
            margin-right: 12px;
            ${symbol === bonded.symbol && `
              background-color: #fff;
              border-radius: 50%;
              border: 0.3px solid #0B0A15;
              padding: 5px;
              width: 25px;
              height: 25px;
            `}
          `}
        />
        <span
          css={`
            position: relative;
            top: 1px;
          `}
        >
          {symbol}
        </span>
      </div>
      <input
        type="text"
        disabled={disabled}
        value={value}
        onChange={onChange}
        placeholder="0"
        css={`
          display: block;
          width: 100%;
          text-align: center;
          font-weight: 600;
          color: ${color ? '#1c1c1c' : '#FFF'};
          font-size: ${isCompact ? '36px' : '88px'};
          background: transparent;
          border: 0;
          outline: none;
          &::placeholder {
            color: ${color ? '#1c1c1c' : '#FFF'};
          }
        `}
      />
    </label>
  )
}

AmountInput.propTypes = {
  color: PropTypes.bool,
  disabled: PropTypes.bool,
  onChange: PropTypes.func,
  symbol: PropTypes.oneOf([collateral.symbol, bonded.symbol]).isRequired,
  value: PropTypes.string,
}

export default AmountInput
